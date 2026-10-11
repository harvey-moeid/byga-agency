"""Optional source download for regenerating the bundled avatars. Python 3 + curl.
Usage: python3 scripts/avatars/fetch.py /tmp/byga-avatar-source
Downloads only the pinned files listed in sources.json, with SHA-256 verification.
"""
import concurrent.futures,hashlib,json,pathlib,subprocess,sys
spec=json.loads(pathlib.Path(__file__).with_name('sources.json').read_text())
destination=pathlib.Path(sys.argv[1])
def fetch(file):
 target=destination/file;target.parent.mkdir(parents=True,exist_ok=True)
 expected=spec['sha256'][file]
 if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()==expected:return
 temporary=target.with_suffix(target.suffix+'.download')
 try:
  subprocess.run(['curl','--fail','--silent','--show-error','--location','--max-time','90',f"https://raw.githubusercontent.com/{spec['repository']}/{spec['commit']}/{file}",'-o',str(temporary)],check=True)
  if hashlib.sha256(temporary.read_bytes()).hexdigest()!=expected:raise RuntimeError('Source checksum mismatch: '+file)
  temporary.replace(target)
 finally:temporary.unlink(missing_ok=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(fetch,spec['files']))
print(f"Verified {len(spec['files'])} source files")
