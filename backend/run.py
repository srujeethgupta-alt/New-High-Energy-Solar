"""
Production entry point for Solar Stock Management.
Usage:
    python -m backend.run           # production
    python -m backend.run --reload   # development
"""
import os
import sys
import argparse

try:
    from dotenv import load_dotenv
    dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.exists(dotenv_path):
        load_dotenv(dotenv_path)
        print(f"[run] Loaded environment from {dotenv_path}")
    else:
        print(f"[run] No .env file found at {dotenv_path}, using defaults")
except ImportError:
    print("[run] python-dotenv not installed, skipping .env loading")

from backend.logger import setup_logger
logger = setup_logger("startup")

if __name__ == "__main__":
    import uvicorn
    parser = argparse.ArgumentParser(description="Solar Stock Management Server")
    parser.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"), help="Host to bind to")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")), help="Port to bind to")
    parser.add_argument("--reload", action="store_true", default=os.environ.get("RELOAD", "false").lower() == "true", help="Enable auto-reload for development")
    parser.add_argument("--ssl-certfile", default=os.environ.get("SSL_CERTFILE", ""), help="SSL certificate file path")
    parser.add_argument("--ssl-keyfile", default=os.environ.get("SSL_KEYFILE", ""), help="SSL key file path")
    args = parser.parse_args()

    ssl_kwargs = {}
    if args.ssl_certfile and args.ssl_keyfile:
        ssl_kwargs["ssl_certfile"] = args.ssl_certfile
        ssl_kwargs["ssl_keyfile"] = args.ssl_keyfile
        logger.info(f"SSL enabled with cert: {args.ssl_certfile}")

    logger.info(f"Starting Solar Stock Management Server v2.0.0")
    logger.info(f"Listening on {args.host}:{args.port} (reload={args.reload})")

    uvicorn.run(
        "backend.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info",
        **ssl_kwargs
    )
