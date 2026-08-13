"""Local development server for the dashboard.

    python serve.py

Same as `python -m http.server --directory site`, except it tells the browser not
to cache anything. Python's default server sends no Cache-Control header, so
browsers apply heuristic caching and keep serving stale app.js and app.css after
an edit. Local only; the real host sets its own caching.
"""

import functools
import http.server

PORT = 8765
DIRECTORY = "site"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory=DIRECTORY)
    # Threading matters: keep-alive connections hold a worker open, so a
    # single-threaded server stops answering after the first browser tab.
    with http.server.ThreadingHTTPServer(("", PORT), handler) as httpd:
        print(f"serving {DIRECTORY}/ at http://localhost:{PORT} (caching disabled)")
        httpd.serve_forever()
