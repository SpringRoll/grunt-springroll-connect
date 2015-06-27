/*
 * grunt-springroll-download
 *
 * Copyright (c) 2015 CloudKid, LLC
 * Licensed under the MIT license.
 */
module.exports = function(grunt)
{
	var desc = "Download games from SpringRoll Connect";
	var async = require('async');
	var request = require('request');
	var Download = require('download');

	var fs = require( 'fs' );
	var path = require( 'path' );

	grunt.registerMultiTask('springroll', desc, function()
	{
		var completed = this.async();

		var options = this.options({
			server: process.env.SPRINGROLL_SERVER || '',
			token: process.env.SPRINGROLL_TOKEN || '',
			dest: '',
			status: 'prod',
			debug: false
		});

		if (!options.server)
		{
			return grunt.log.fail("Server (options.server) is required");
		}

		if (!options.dest)
		{
			return grunt.log.fail("Destination (options.dest) is required");
		}

		var games;
		var tasks = {};

		// short-hand version where data is a list
		if (Array.isArray(this.data))
		{
			games = this.data;
		}
		// verbose format
		else if (Array.isArray(this.data.games))
		{
			games = this.data.games;
			options.status = this.status || options.status;
		}

		if (!games || !games.length)
		{
			return grunt.log.fail("Task must have games");
		}

		if (options.status != 'prod' && !options.token)
		{
			return grunt.log.fail('Non-production level status require token option');
		}

		games.forEach(function(game)
		{
			if (typeof game == "string")
			{
				game = { slug: game };
			}

			// Download file request
			var download = new Download({mode: '755', extract: true})
				.dest(options.dest + '/' + game.slug);

			// Create the async task
			tasks[game.slug] = downloadArchive.bind(
				download, 
				game.slug, 
				apiCall(game, options),
				options
			);
		});

		// Make a bunch of API calls to request the data
		async.series(tasks, function(err, results)
		{
			if (err)
			{
				return grunt.log.fail(err);
			}
			completed();
		});
	});

	function apiCall(game, options)
	{		
		if (!game.slug)
		{
			return grunt.log.fail("Game must contain a slug");
		}

		var call = options.server + '/api/release/' + game.slug + '/';

		if (game.version) 
		{
			call += 'version/' + game.version;
		}
		else if (game.commit) 
		{
			call += 'commit/' + game.commit;
		}
		else if (game.status) 
		{
			call += game.status;
		}
		else 
		{
			call += options.status;
		}

		call += '?archive=true';

		if (options.debug)
		{
			call += '&debug=true';
		}

		if (options.token)
		{
			call += '&token=' + options.token;
		}
		return call;
	}

	// Handle the request
	function downloadArchive(slug, call, options, done)
	{
		grunt.log.write('Downloading "' + slug + '" ... ');

		request(call, function(err, response, body)
		{
			if (err) return done(err);

			var result = JSON.parse(body);

			if (!result.success) 
			{
				return done(result.error + ' with game "' + slug + '"');
			}

			if( options.json )
			{
				grunt.log.write('Writing json ... ');

				var writeStream = fs.createWriteStream( path.join( options.dest, slug + '.json' ) );
				writeStream.write( JSON.stringify(result.data) );
				writeStream.end();
			}

			grunt.log.write('Installing ... ');

			this.get(result.data.url).run(function(err, files)
			{
				if (err) 
				{
					return done('Unable to download archive for game "' + slug + '"');
				}
				grunt.log.writeln('Done.');
				done(null, files);
			});
		}
		.bind(this));
	}
};