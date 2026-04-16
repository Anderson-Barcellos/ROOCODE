from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
import pandas as pd
from pathlib import Path

router = APIRouter()
sleep_data_path = Path(__file__).parent / "sleep_data.csv"


def _organizeSleep(csv_path: Path):
    data = pd.read_csv(csv_path)

    if "Date/Time" in data.columns:
        dates = pd.to_datetime(pd.Series(data["Date/Time"]), format="mixed")
        data["Date/Time"] = pd.Series([date.strftime("%d-%m-%y") for date in dates])

    cols_to_drop = [c for c in ["Start", "End", "Sources"] if c in data.columns]
    if cols_to_drop:
        data = data.drop(cols_to_drop, axis=1)

    data.to_csv(csv_path, index=False)


def _extract_payload_from_multipart(body: bytes, content_type: str) -> bytes:
    """
    Extrai o payload real de um multipart/form-data.
    O iPhone envia com filename esquisito (//mnt/...) ou vazio,
    então não podemos usar UploadFile — fazemos parse manual do boundary.
    """
    boundary = None
    for part in content_type.split(";"):
        part = part.strip()
        if part.startswith("boundary="):
            boundary = part[len("boundary="):].strip().strip('"')
            break

    if not boundary:
        return body

    delimiter = f"--{boundary}".encode()
    parts = body.split(delimiter)

    for part in parts[1:]:
        if part in (b"--", b"--\r\n", b""):
            continue
        if b"\r\n\r\n" in part:
            _, content = part.split(b"\r\n\r\n", 1)
            content = content.rstrip(b"\r\n")
            return content

    return body


@router.post("")
async def processSleep(request: Request):
    body = b""
    async for chunk in request.stream():
        body += chunk

    content_type = request.headers.get("content-type", "")

    if "multipart/form-data" in content_type:
        payload = _extract_payload_from_multipart(body, content_type)
    else:
        payload = body

    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = payload.decode("latin-1")
        except Exception as e:
            return {"msg": "Não foi possível decodificar o arquivo", "error": str(e)}

    if not text.strip():
        return {"msg": "Arquivo recebido está vazio"}

    with open(sleep_data_path, "w", encoding="utf-8", newline="") as f:
        f.write(text)

    _organizeSleep(sleep_data_path)
    return {"msg": "Arquivo processado com sucesso"}


@router.get("")
async def getSleep():
    if not sleep_data_path.exists():
        return JSONResponse(content=[], status_code=200)
    df = pd.read_csv(sleep_data_path)
    return JSONResponse(content=df.to_dict(orient="records"))
