import { readFileSync, rmSync } from 'node:fs';

import { src, dest, watch, series, parallel } from 'gulp';
import plumber from 'gulp-plumber';
import htmlmin from 'gulp-htmlmin';
import postcss from 'gulp-postcss';
import { createGulpEsbuild } from 'gulp-esbuild';
import browserslistToEsbuild from 'browserslist-to-esbuild';
import server from 'browser-sync';
import bemlinter from 'gulp-html-bemlinter';

const PATH_TO_SOURCE = './source/';
const PATH_TO_DIST = './build/';
const PATHS_TO_STATIC = [
  `${PATH_TO_SOURCE}*.ico`,
  `${PATH_TO_SOURCE}*.webmanifest`,
  `${PATH_TO_SOURCE}favicons/**/*.{svg,png,webp}`,
  `${PATH_TO_SOURCE}fonts/**/*.woff2`,
  `${PATH_TO_SOURCE}images/**/*{svg,avif,webp}`,
  `${PATH_TO_SOURCE}vendor/**/*`,
  `!${PATH_TO_SOURCE}**/README.md`,
];
let isDevelopment = true;

export function processMarkup () {
  return src(`${PATH_TO_SOURCE}**/*.html`)
    .pipe(htmlmin({ collapseWhitespace: !isDevelopment }))
    .pipe(dest(PATH_TO_DIST))
    .pipe(server.stream());
}

export function lintBem () {
  return src(`${PATH_TO_SOURCE}**/*.html`)
    .pipe(bemlinter());
}

export function processStyles () {
  const context = { isDevelopment };

  return src(`${PATH_TO_SOURCE}styles/*.scss`, { sourcemaps: isDevelopment })
    .pipe(plumber())
    .pipe(postcss(context))
    .pipe(dest((path) => {
      path.extname = '.css';
      return `${PATH_TO_DIST}styles`;
    }, { sourcemaps: isDevelopment }))
    .pipe(server.stream());
}

export function processScripts () {
  const gulpEsbuild = createGulpEsbuild({ incremental: isDevelopment });

  return src(`${PATH_TO_SOURCE}scripts/*.js`)
    .pipe(gulpEsbuild({
      bundle: true,
      format: 'esm',
      // splitting: true,
      platform: 'browser',
      minify: !isDevelopment,
      sourcemap: isDevelopment,
      target: browserslistToEsbuild(),
    }))
    .pipe(dest(`${PATH_TO_DIST}scripts`))
    .pipe(server.stream());
}

export function copyStatic () {
  return src(PATHS_TO_STATIC, { base: PATH_TO_SOURCE, encoding: false })
    .pipe(dest(PATH_TO_DIST));
}

export function startServer () {
  const serveStatic = PATHS_TO_STATIC
    .filter((path) => path.startsWith('!') === false)
    .map((path) => {
      const dir = path.replace(/(\/\*\*\/.*$)|\/$/, '');
      const route = dir.replace(PATH_TO_SOURCE, '/');

      return { route, dir };
    });

  server.init({
    server: {
      baseDir: PATH_TO_DIST
    },
    serveStatic,
    cors: true,
    notify: false,
    ui: false,
  }, (err, bs) => {
    bs.addMiddleware('*', (req, res) => {
      res.write(readFileSync(`${PATH_TO_DIST}404.html`));
      res.end();
    });
  });

  watch(`${PATH_TO_SOURCE}**/*.{html,njk}`, series(processMarkup));
  watch(`${PATH_TO_SOURCE}**/*.{scss,svg}`, series(processStyles));
  watch(`${PATH_TO_SOURCE}scripts/**/*.js`, series(processScripts));
  watch(PATHS_TO_STATIC, series(reloadServer));
}

function reloadServer (done) {
  server.reload();
  done();
}

export function removeBuild (done) {
  rmSync(PATH_TO_DIST, {
    force: true,
    recursive: true,
  });
  done();
}

export function buildProd (done) {
  isDevelopment = false;
  series(
    removeBuild,
    parallel(
      processMarkup,
      processStyles,
      processScripts,
      copyStatic,
    ),
  )(done);
}

export function runDev (done) {
  series(
    removeBuild,
    parallel(
      processMarkup,
      processStyles,
      processScripts,
    ),
    startServer,
  )(done);
}
