const gulp            = require('gulp'),
      cleanDest       = require('gulp-clean-dest'),
      sass            = require('gulp-sass'),
      sourcemaps      = require('gulp-sourcemaps'),
      connect         = require('gulp-connect'),
      autoprefixer    = require('gulp-autoprefixer'),
      gulpif          = require('gulp-if'),
      plumber         = require('gulp-plumber'),
      notify          = require('gulp-notify'),
	  open            = require('gulp-open'),
	  wrap            = require('gulp-wrap')

const DEBUG = ['prod', 'production'].indexOf(process.env.NODE_ENV) < 0

let TASK_NOTIFICATION = false,
	LIVE_RELOAD = false

const plumberErrorHandler = {
	errorHandler: notify.onError({
		title: 'Gulp',
		message: 'Error: <%= error.message %>'
	})
}
      
gulp.task('sass', () => {
	let main = gulp.src('src/jquery.skedTape.sass')
		.pipe(plumber(plumberErrorHandler))
	if (DEBUG) {
		main = main.pipe(sourcemaps.init())
	}
	main = main.pipe(sass({
			outputStyle: 'expanded',
			sourcemap: true,
			includePaths: [
				//__dirname + '/node_modules/foundation-sites/scss'
			],
			errLogToConsole: true
		}))
		.pipe(autoprefixer())
	if (DEBUG) {
		main = main.pipe(sourcemaps.write('.'))
	}
	// Remove piped files so that if there was an error
	// their old versions wont exist.
	return main.pipe(cleanDest('dist'))
		.pipe(gulp.dest('dist'))
		.pipe(gulpif(TASK_NOTIFICATION, notify({message: 'SASS built'})))
})

gulp.task('copy-js', () =>
	gulp.src(`src/*.js`)
        .pipe(plumber(plumberErrorHandler))
		.pipe(cleanDest('dist'))
		.pipe(wrap({ src: './umd.template.txt' }))
		.pipe(gulp.dest('dist'))
		.pipe(gulpif(TASK_NOTIFICATION, notify({message: 'JS copied'})))
)

gulp.task('dist-to-docs', () =>
	gulp.src(`dist/*`)
        .pipe(plumber(plumberErrorHandler))
        .pipe(cleanDest('docs'))
		.pipe(gulp.dest('docs'))
		.pipe(gulpif(LIVE_RELOAD, connect.reload()))
)

gulp.task('watch', () => {
	LIVE_RELOAD = true
	TASK_NOTIFICATION = true
	connect.server({
		name: 'Dist App',
		root: 'docs',
		host: '0.0.0.0',
		port: 8080,
		livereload: true
	});
	gulp.watch('src/*.sass', gulp.parallel('sass'))
	gulp.watch('src/*.js', gulp.parallel('copy-js'))
	gulp.watch('dist/*', gulp.parallel('dist-to-docs'))
	// Open browser
	gulp.src(__filename).pipe(open({uri: 'http://localhost:8080'}))
})

gulp.task('build', gulp.series(
	gulp.parallel('sass', 'copy-js'),
	'dist-to-docs'
))

gulp.task('default', gulp.series('build', 'watch'))
