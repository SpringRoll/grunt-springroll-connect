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
	var fs = require('fs');
	var path = require('path');
	var mkdirp = require('mkdirp');
	var colors = require('colors');

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

		// Create the destination if it doesn't exist
		mkdirp.sync(options.dest);

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

			var id = game.slug || game.bundleId;

			// Download file request
			var download = new Download({mode: '755', extract: true})
				.dest(options.dest + '/' + id);

			// Create the async task
			tasks[id] = downloadArchive.bind(
				download, 
				id,
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
		if (!game.slug && !game.bundleId)
		{
			return grunt.log.fail("Game must contain a slug or bundleId");
		}

		var id = game.slug || game.bundleId;

		var call = options.server + '/api/release/' + id;

		call += '?archive=true';

		if (game.version) 
		{
			call += '&version=' + game.version;
		}
		else if (game.commit) 
		{
			call += '&commit=' + game.commit;
		}
		else if (game.status) 
		{
			call += '&status=' + game.status;
		}
		else 
		{
			call += '&status=' + options.status;
		}
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
	function downloadArchive(id, call, options, done)
	{
		grunt.log.write('Downloading '.gray + id.yellow + ' ... '.gray);

		request(call, function(err, response, body)
		{
			if (err) return done(err);

			var result = JSON.parse(body);

			if (!result.success) 
			{
				return done(result.error + ' with game "' + id + '"');
			}

			if (options.json)
			{
				grunt.log.write('Writing json ... '.gray);

				var writeStream = fs.createWriteStream(path.join(options.dest, id + '.json'));
				writeStream.write(JSON.stringify(result.data, null, options.debug ? "\t":""));
				writeStream.end();
			}

			grunt.log.write('Installing ... '.gray);

			this.get(result.data.url).run(function(err, files)
			{
				if (err) 
				{
					return done('Unable to download archive for game "' + id + '"');
				}
				grunt.log.writeln('Done.'.green);
				done(null, files);
			});
		}
		.bind(this));
	}
};