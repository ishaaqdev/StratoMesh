# StratoMesh

Upload a GeoTIFF DEM file and get an interactive 3D terrain viewer plus a downloadable OBJ mesh.

## What it does

- Accepts a `.tif` / `.tiff` DEM file (tested at 30 m resolution)
- Resamples to 256x256 for the browser viewer and 512x512 for the OBJ export
- Renders an elevation-shaded 3D terrain with orbit controls (rotate, zoom, pan)
- Exports a clean `.obj` file you can open in Blender, MeshLab, or any 3D tool

## Run with Docker (recommended)

```bash
cd C:\ishaaq\StratoMesh

docker build -t stratomesh .

docker run -p 8000:8000 stratomesh
```

Open http://localhost:8000 in your browser.

## Run locally without Docker

Requires Python 3.10+.

```bash
cd C:\ishaaq\StratoMesh

pip install -r requirements.txt

cd app
uvicorn main:app --reload --port 8000
```

Open http://localhost:8000 in your browser.

## Usage

1. Drop or browse for a `.tif` DEM file
2. Click **Process Terrain** and wait a few seconds
3. Interact with the 3D viewer:
   - Left-click drag to rotate
   - Scroll to zoom
   - Right-click drag to pan
4. Switch between **Solid**, **Wireframe**, and **Both** views
5. Click **Download OBJ** to save the mesh

## Test file

A sample 30 m resolution DEM is included at `test_files/test.tif`.

## Stack

- Backend: FastAPI + rasterio + numpy
- Frontend: Three.js (ES module via importmap)
- Fonts: Poppins, Roboto
