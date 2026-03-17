import uvicorn

from .app import create_app
from .config import DEFAULT_CONFIG


def main():
    uvicorn.run(
        create_app(),
        host=DEFAULT_CONFIG.host,
        port=DEFAULT_CONFIG.port,
    )


if __name__ == "__main__":
    main()
