import uuid
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from processor import generate_obj, process_dem

app = FastAPI(title="StratoMesh")

TEMP_DIR = Path("temp")
TEMP_DIR.mkdir(exist_ok=True)


@app.post("/api/upload")
async def upload_tif(file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".tif", ".tiff")):
        raise HTTPException(status_code=400, detail="Only .tif / .tiff files are accepted.")

    file_id = str(uuid.uuid4())
    tif_path = TEMP_DIR / f"{file_id}.tif"

    try:
        content = await file.read()
        tif_path.write_bytes(content)

        result = process_dem(tif_path, viz_size=256, export_size=512)

        obj_path = TEMP_DIR / f"{file_id}.obj"
        generate_obj(
            result["export_data"],
            result["min_elevation"],
            result["max_elevation"],
            obj_path,
        )

        elevation_data = np.round(result["viz_data"].flatten(), 2).tolist()

        return JSONResponse(
            {
                "file_id": file_id,
                "width": 256,
                "height": 256,
                "min_elevation": result["min_elevation"],
                "max_elevation": result["max_elevation"],
                "elevation_data": elevation_data,
            }
        )

    except Exception as exc:
        tif_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/download/{file_id}")
async def download_obj(file_id: str):
    try:
        uuid.UUID(file_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file ID.")

    obj_path = TEMP_DIR / f"{file_id}.obj"
    if not obj_path.exists():
        raise HTTPException(status_code=404, detail="OBJ file not found.")

    return FileResponse(
        obj_path,
        filename="terrain.obj",
        media_type="application/octet-stream",
    )


app.mount("/", StaticFiles(directory="static", html=True), name="static")
