import uvicorn

from .app import create_app
from .config import DEFAULT_CONFIG
from .qwen_runtime import QwenRuntime


def main():
    uvicorn.run(
        create_app(runtime=QwenRuntime.from_pretrained()),
        host=DEFAULT_CONFIG.host,
        port=DEFAULT_CONFIG.port,
    )


if __name__ == "__main__":
    main()
