"""Portable-build entry point: start the server and open the browser."""
import multiprocessing
import sys

from ytclip.app import main

if __name__ == "__main__":
    multiprocessing.freeze_support()
    sys.exit(main())
