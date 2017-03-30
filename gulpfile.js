/**
 * @fileoverview
 * @author Taketoshi Aono
 */

const _                  = require('lodash');
const fs                 = require('fs');
const gulp               = require('gulp');
const path               = require('path');
const {execSync, spawn}  = require('child_process');

const DIST = 'dist';
const BIN_DIR = path.resolve(process.cwd(), './node_modules/.bin/') + '/';


gulp.task('stop-serve', done => {
  try {
    const pid = fs.readFileSync('.dev.pid', 'utf8');
    process.kill(parseInt(pid, 10));
    fs.unlinkSync('.dev.pid');
  } catch(e) {
    throw new Error('Server process does not exists!');
  }  
});


function typescript(srcs = [], useSourcemaps = false) {
  const tsc = require('gulp-typescript');
  const sourceMaps = require('gulp-sourcemaps');
  const project = tsc.createProject('tsconfig.json', {
    typescript: require('typescript'),
    declaration: true
  });
  const src = gulp.src(srcs.concat(['src/**/*', '_references.ts']));
  return (() => {
    if (useSourcemaps) {
      return src.pipe(sourceMaps.init());
    }
    return src;
  })()
    .pipe(project());
}


/**
 * typescript
 */
gulp.task('typescript', () => {
  return typescript(['!src/**/__tests__/**', '!src/**/__bench__/**'])
    .pipe(gulp.dest('lib/'))
    .on('error', () => process.exit(1));
});


/**
 * typescript
 */
gulp.task('typescript-test', () => {
  const sourceMaps = require('gulp-sourcemaps');
  return typescript([], true)
    .pipe(sourceMaps.write())
    .pipe(gulp.dest('lib/'))
    .on('error', () => process.exit(1));
});


/**
 * minify
 */
gulp.task('minify', ['typescript'], done => {
  minify({file: 'lib/index.js', uglify: true, souceMaps: false, builtins: false, onEnd: done, filesize: true, isTsify: false});
});


/**
 * minify debug
 */
gulp.task('minify-debug', ['typescript'], done => {
  minify({file: 'lib/index.js', uglify: false, souceMaps: true, builtins: false, onEnd: done, filesize: false, isTsify: false});
});


function minify({file, uglify = false, sourceMaps = false, onEnd = null, builtins = true, filesize = false, isTsify = true}) {
  const browserify = require('browserify');
  const collapse   = require('bundle-collapser/plugin');
  const tsify      = require('tsify');
  const source     = require('vinyl-source-stream');
  const buffer     = require('vinyl-buffer');
  const sourcemaps = require('gulp-sourcemaps');
  const guglify    = require('gulp-uglify');
  const Uglify     = require('uglify-js');
  const derequire  = require('gulp-derequire');
  const size       = require('gulp-check-filesize');
  const gif        = require('gulp-if');

  const b = browserify(file, {debug: sourceMaps, builtins, standalone: 'Fuel'})
    .on('error', e => {
      console.error(e);
      process.exit(1);
    });
  return (() => {
    if (isTsify) {
      return b.plugin(tsify);
    }
    return b;
  })()
    .plugin(collapse)
    .bundle()
    .pipe(source(`${path.basename(file).replace(/\.[^.]+$/, '')}.bundle.js`))
    .pipe(derequire())
    .pipe(buffer())
    .pipe(gif(uglify, guglify({
      mangle: true,
      compress: true,
      mangleProperties: false
    })))
    .pipe(gif(sourceMaps, sourcemaps.init({loadMaps: true})))
    .pipe(gif(sourceMaps, sourcemaps.write()))
    .pipe(gif(filesize, size({enableGzip: true})))
    .pipe(gulp.dest(`./${DIST}`))
    .on('end', () => onEnd && onEnd());
}


/**
 * 一時ファイルの削除
 */
gulp.task('clean', (cb) => {
  return require('del')([DIST], cb);
});


gulp.task('bundle-all-tests', (done) => {
  const async = require('async');
  async.forEachSeries(require('glob').sync('src/**/__tests__/*.spec.ts*'), (file, done) => {
    minify({file, onEnd: done, sourceMaps: true});
  }, done);
});


const KARMA_CONF = require('./karma.conf')();


const doRunKarma = (singleRun, browser, done) => {
  const karma = require('karma');
  return new karma.Server(_.assign(KARMA_CONF, {
    browsers: [browser],
    singleRun: singleRun
  }), done).start();
};


const runKarma = (singleRun, browser, done) => {
  if (!singleRun) {
    doRunKarma(false, browser, done);
  } else {
    doRunKarma(true, browser, done);
  }
};


/**
 * karma
 */
gulp.task('test', ['typescript-test'], () => {
  require('glob').sync('./lib/**/__tests__/*.spec.js').forEach(c => {
    execSync(`node ./node_modules/.bin/mocha ${c}`, {stdio: [0, 1, 2]});
  });
});


/**
 * karma
 */
gulp.task('run-test-chrome', runKarma.bind(null, true, 'Chrome'));

gulp.task('run-test-phantom', runKarma.bind(null, true, 'PhantomJS'));


/**
 * karma
 */
gulp.task('tdd-chrome', runKarma.bind(null, false, 'Chrome'));


/**
 * karma
 */
gulp.task('tdd', runKarma.bind(null, false, 'PhantomJS'));


/**
 * karma
 */
gulp.task('test-debug', runKarma.bind(null, true, 'PhantomJS_debug'));


gulp.task('test-phantom', () => {
  const runSequence = require('run-sequence');
  return runSequence(
    'clean',
    'bundle-all-tests',
    'run-test-phantom'
  );
});


gulp.task('test-chrome', () => {
  const runSequence = require('run-sequence');
  return runSequence(
    'clean',
    'bundle-all-tests',
    'run-test-chrome'
  );
});


gulp.task('publish', done => {
  spawn('npm', ['publish'], { stdio: 'inherit' }).on('close', done);
});


gulp.task('release', () => {
  const runSequence = require('run-sequence');
  return runSequence(
    'test-chrome',
    'clean',
    'minify',
    'publish'
  );
});


gulp.task('default', () => {
  const runSequence = require('run-sequence');
  return runSequence(
    'clean',
    'minify'
  );
});
