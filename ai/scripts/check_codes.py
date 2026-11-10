"""Quick check of GET /documents/codes (used during development)."""
import json
import urllib.request

r = json.load(urllib.request.urlopen("http://localhost:8000/documents/codes", timeout=60))
print("documents_scanned:", r["documents_scanned"], "| codes:", len(r["codes"]))
for c in r["codes"][:8]:
    print(" ", c["code"].ljust(8), c["description"][:70])
