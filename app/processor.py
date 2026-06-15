import io

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from pathlib import Path


def process_dem(tif_path: Path, viz_size: int = 256, export_size: int = 512):
    with rasterio.open(tif_path) as src:
        nodata = src.nodata

        viz_raw = src.read(
            [1],
            out_shape=(1, viz_size, viz_size),
            resampling=Resampling.bilinear,
        )[0].astype(np.float32)

        export_raw = src.read(
            [1],
            out_shape=(1, export_size, export_size),
            resampling=Resampling.bilinear,
        )[0].astype(np.float32)

    for data in (viz_raw, export_raw):
        if nodata is not None:
            data[data == nodata] = np.nan
        data[data < -9000] = np.nan

    valid = viz_raw[np.isfinite(viz_raw)]
    if len(valid) == 0:
        raise ValueError("No valid elevation data found in the file.")

    min_elev = float(valid.min())
    max_elev = float(valid.max())

    viz_raw = np.where(np.isfinite(viz_raw), viz_raw, min_elev)
    export_raw = np.where(np.isfinite(export_raw), export_raw, min_elev)

    return {
        "viz_data": viz_raw,
        "export_data": export_raw,
        "min_elevation": min_elev,
        "max_elevation": max_elev,
    }


def generate_texture(data: np.ndarray, min_elev: float, max_elev: float) -> bytes:
    """Hillshaded terrain colormap texture returned as PNG bytes."""
    # ── Hillshade (sun from NW at 45 deg — azimuth 315, altitude 45) ─────
    az  = 315 * np.pi / 180
    alt = 45  * np.pi / 180
    cell = 30.0  # 30 m resolution

    dx = np.gradient(data, axis=1)
    dy = np.gradient(data, axis=0)

    mag = np.sqrt((dx / cell) ** 2 + (dy / cell) ** 2 + 1.0)
    nx = (-dx / cell) / mag
    ny = (-dy / cell) / mag
    nz = 1.0 / mag

    sx = np.cos(alt) * np.sin(az)
    sy = np.cos(alt) * np.cos(az)
    sz = np.sin(alt)

    shade = np.clip(nx * sx + ny * sy + nz * sz, 0.0, 1.0)

    # ── Elevation colormap: valley green -> hillside tan -> rocky gray ────
    norm = (data - min_elev) / max(float(max_elev - min_elev), 1.0)

    t_stops = [0.00, 0.20, 0.42, 0.62, 0.80, 1.00]
    r_stops = [0.22, 0.38, 0.56, 0.67, 0.60, 0.86]
    g_stops = [0.42, 0.57, 0.60, 0.56, 0.50, 0.86]
    b_stops = [0.18, 0.28, 0.32, 0.38, 0.40, 0.86]

    r = np.interp(norm, t_stops, r_stops)
    g = np.interp(norm, t_stops, g_stops)
    b = np.interp(norm, t_stops, b_stops)
    rgb = np.stack([r, g, b], axis=2)

    # Hillshade modulates brightness: shadows at 30%, lit faces at 100%
    blended = rgb * (0.30 + 0.70 * shade[:, :, np.newaxis])
    blended = np.clip(blended, 0.0, 1.0)

    img = Image.fromarray((blended * 255).astype(np.uint8), "RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def generate_obj(data: np.ndarray, min_elev: float, max_elev: float, output_path: Path):
    h, w = data.shape
    r = max_elev - min_elev if abs(max_elev - min_elev) > 1e-6 else 1.0

    norm = (data - min_elev) / r * 0.5

    x_lin = np.linspace(0.0, 1.0, w, dtype=np.float32)
    z_lin = np.linspace(1.0, 0.0, h, dtype=np.float32)
    xx, zz = np.meshgrid(x_lin, z_lin)

    verts = np.stack([xx.ravel(), norm.ravel(), zz.ravel()], axis=1)

    rows = np.arange(h - 1, dtype=np.int32)
    cols = np.arange(w - 1, dtype=np.int32)
    rr, cc = np.meshgrid(rows, cols, indexing="ij")
    rr = rr.ravel()
    cc = cc.ravel()

    tl = rr * w + cc + 1
    tr = tl + 1
    bl = (rr + 1) * w + cc + 1
    br = bl + 1

    faces = np.empty(((h - 1) * (w - 1) * 2, 3), dtype=np.int32)
    faces[0::2] = np.stack([tl, bl, tr], axis=1)
    faces[1::2] = np.stack([tr, bl, br], axis=1)

    with open(output_path, "wb") as f:
        header = (
            f"# StratoMesh Terrain Export\n"
            f"# Grid: {w}x{h}\n"
            f"# Elevation range: {min_elev:.2f} - {max_elev:.2f}\n"
            f"o Terrain\n\n"
        ).encode()
        f.write(header)
        np.savetxt(f, verts, fmt="v %.6f %.6f %.6f")
        f.write(b"\n")
        np.savetxt(f, faces, fmt="f %d %d %d")
