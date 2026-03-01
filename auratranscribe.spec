# auratranscribe.spec
import static_ffmpeg
import os

# Get static-ffmpeg binary paths
ffmpeg_path = os.path.join(os.path.dirname(static_ffmpeg.__file__), "bin")

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('frontend', 'frontend'),          # Bundle entire frontend
        (ffmpeg_path, 'static_ffmpeg/bin'), # Bundle ffmpeg binaries
    ],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'faster_whisper',
        'ctranslate2',
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='AuraTranscribe',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # No terminal window
    icon='frontend/assets/icon.ico',  # Add an .ico file
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    name='AuraTranscribe',
)