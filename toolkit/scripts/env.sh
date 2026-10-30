# Env de render del sandbox — pega esto al inicio de cualquier sesión de diseño
export LD_LIBRARY_PATH=/home/user/lib
export CHROME=/tmp/chromium
# Playwright / Puppeteer / Lighthouse ya funcionan con ese binario:
#   chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] })
# Fuentes disponibles (TTF, usables vía @font-face file:///home/user/lib/fonts/<x>.ttf):
ls /home/user/lib/fonts
