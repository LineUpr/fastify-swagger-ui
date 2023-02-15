const fs = require('fs')
const fse = require('fs-extra')
const crypto = require('crypto')
// const swaggerUiAssetPath = require('swagger-ui-dist').getAbsoluteFSPath()
const resolve = require('path').resolve
const https = require('https')
const tar = require('tar')
const path = require('path')
const os = require('os')
const childProcess = require('child_process')
const process = require('process')

const dist = 'https://codeload.github.com/swagger-api/swagger-ui/tar.gz/refs/tags/v4.16.0-alpha.1'

;

(async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swagger-ui-download-'))
  console.log(`Temporary directory: ${tempDir}`)

  // (1) download and untar
  await downloadAndUntar(dist, tempDir)
  // (2) run NPM tasks for swagger-ui (dependencies and build)
  await run('npm', ['install'], tempDir)
  await run('npm', ['run', 'build'], tempDir)
  // (3) execute `prepareSwaggerUi`
  prepareSwaggerUi(path.join(tempDir, 'dist'))

  console.log('Done.')
})().catch(err => console.error(err))

function downloadAndUntar (dist, cwd) {
  console.log(`Downloading ${dist}`)
  return new Promise(resolve => {
    const tarStream = tar.extract({ cwd, stripComponents: 1 })
    https.get(dist, response => {
      response.pipe(tarStream)
      tarStream.on('finish', () => {
        console.log('Downloaded')
        resolve()
      })
    })
  })
}

const spawned = []

process.on('SIGINT', () => {
  console.log(`Killing ${spawned.length} processes`)
  spawned.forEach(child => {
    child.kill()
  })
})

function run (command, args, cwd) {
  console.log('Exec', command, args)
  return new Promise((resolve, reject) => {
    const spawnedProcess = childProcess.spawn(command, args, { cwd, stdio: 'inherit' })
    spawned.push(spawnedProcess)
    spawnedProcess.on('exit', () => {
      if (spawnedProcess.exitCode !== 0) {
        reject(new Error(`Exit code ${spawnedProcess.exitCode}`))
      }
      resolve()
    })
  })
}

function prepareSwaggerUi (swaggerUiAssetPath) {
  console.log('prepareSwaggerUi', swaggerUiAssetPath)

  const folderName = 'static'

  fse.emptyDirSync(resolve(`./${folderName}`))

  // since the original swagger-ui-dist folder contains non UI files
  const filesToCopy = [
    'favicon-16x16.png',
    'favicon-32x32.png',
    'index.html',
    'index.css',
    'oauth2-redirect.html',
    'swagger-ui-bundle.js',
    'swagger-ui-bundle.js.map',
    'swagger-ui-standalone-preset.js',
    'swagger-ui-standalone-preset.js.map',
    'swagger-ui.css',
    'swagger-ui.css.map',
    'swagger-ui.js',
    'swagger-ui.js.map'
  ]
  filesToCopy.forEach(filename => {
    fse.copySync(`${swaggerUiAssetPath}/${filename}`, resolve(`./static/${filename}`))
  })

  const sha = {
    script: [],
    style: []
  }
  function computeCSPHashes (path) {
    const scriptRegex = /<script>(.*)<\/script>/gis
    const styleRegex = /<style>(.*)<\/style>/gis
    const indexSrc = fs.readFileSync(resolve(path)).toString('utf8')
    let result = scriptRegex.exec(indexSrc)
    while (result !== null) {
      const hash = crypto.createHash('sha256')
      hash.update(result[1])
      sha.script.push(`'sha256-${hash.digest().toString('base64')}'`)
      result = scriptRegex.exec(indexSrc)
    }
    result = styleRegex.exec(indexSrc)
    while (result !== null) {
      const hash = crypto.createHash('sha256')
      hash.update(result[1])
      sha.style.push(`'sha256-${hash.digest().toString('base64')}'`)
      result = styleRegex.exec(indexSrc)
    }
  }
  computeCSPHashes(`./${folderName}/index.html`)
  computeCSPHashes(`./${folderName}/oauth2-redirect.html`)
  fse.writeFileSync(resolve(`./${folderName}/csp.json`), JSON.stringify(sha))
}
