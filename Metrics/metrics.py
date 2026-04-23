import json
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pathlib import Path
import pandas as pd
from pandas.errors import EmptyDataError

router = APIRouter()




@router.post("")
async def process_metrics_data(request: Request):
    path = Path(__file__).parent / "metrics.csv"
    path.parent.mkdir(parents=True, exist_ok=True)

    form = await request.form()

    file_obj = form.get("HealthData")
    if file_obj is None:
        for val in form.values():
            if hasattr(val, "read"):
                file_obj = val
                break

    if file_obj is None:
        return JSONResponse(content={"message": "No file found in request"}, status_code=422)

    binary = await file_obj.read()  # type: ignore
    with open(path, "wb") as f:
        f.write(binary)

    print("[🏁]: binary payload saved successfully")
    return JSONResponse(content={"message": "File created"})


@router.get("")
async def getMetrics():
    path = Path(__file__).parent / "metrics.csv"
    if not path.exists():
        return JSONResponse(content=[], status_code=200)
    try:
        df = pd.read_csv(path)
    except EmptyDataError:
        return JSONResponse(content=[], status_code=200)
    # Pipeline: to_json converte NaN → null (pandas safe) → json.loads volta pra list[dict].
    # Por que não to_dict direto: preserva NaN (float) que Starlette rejeita com ValueError.
    # Por que não to_json como resposta: geraria double-encoding (string JSON envolta em aspas).
    records = json.loads(df.to_json(orient="records")) #type: ignore
    return JSONResponse(content=records)
