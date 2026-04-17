import json
from fastapi import APIRouter, UploadFile
from fastapi.responses import JSONResponse
from pathlib import Path
import pandas as pd

router = APIRouter()


def _organizeMetrics(path: Path):
    df = pd.read_csv(path)
    drop_list = [header for header in df.columns if "(hr)" in header]
    if drop_list != []:
        try:
            df.drop(columns=drop_list, inplace=True)
            df.to_csv(path, index=False)
        except Exception as e:
            print(f"[❌]: Error dropping columns - {e}")


@router.post("")
async def process_metrics_data(HealthData: UploadFile):
    path = Path(__file__).parent / "metrics.csv"
    path.parent.mkdir(parents=True, exist_ok=True)

    binary = await HealthData.read()
    with open(path, "wb") as f:
        f.write(binary)

    _organizeMetrics(path)
    print("[🏁]: binary payload saved successfully")
    return JSONResponse(content={"message": "File created"})


@router.get("")
async def getMetrics():
    path = Path(__file__).parent / "metrics.csv"
    if not path.exists():
        return JSONResponse(content=[], status_code=200)
    df = pd.read_csv(path)
    records = json.loads(df.to_json(orient="records"))
    return JSONResponse(content=records)
