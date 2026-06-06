import json
import os
from pathlib import Path
from urllib import request, error


BASE_URL = os.getenv("RIDER_OPS_BASE_URL", "http://localhost:3000")
IMPORT_SECRET = os.getenv("IMPORT_SECRET")
SAMPLE_FILE = Path(__file__).with_name("sample_attendance.json")


def post_json(path: str, payload: object) -> dict:
    if not IMPORT_SECRET:
        raise RuntimeError("Missing IMPORT_SECRET environment variable")

    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        f"{BASE_URL}{path}",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-import-secret": IMPORT_SECRET,
        },
    )

    try:
        with request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise RuntimeError(f"Import failed with HTTP {exc.code}: {detail}") from exc


def main() -> None:
    records = json.loads(SAMPLE_FILE.read_text(encoding="utf-8"))
    result = post_json("/api/import/attendance", {"source": "python_import_example", "records": records})
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
