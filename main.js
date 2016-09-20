
var express = require('express');
var twitterAPI = require('node-twitter-api');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var smaz = require('smaz');
var ejs = require('ejs');
var diff = require('diff');
var bodyParser = require('body-parser');

var app = express();
app.use(cookieParser());
app.use(session({
	secret: 'keyboard cat',
	resave: false,
	saveUninitialized: true
}));
app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

var editors = {};

var twitter = new twitterAPI({
	consumerKey: process.env.consumerKey,
	consumerSecret: process.env.consumerSecret,
	callback: 'http://localhost/wiki'
});

app.get('/', function(req, res) { res.sendFile(__dirname + '/views/index.html'); });
app.get('/wiki', function(req, res) { res.sendFile(__dirname + '/views/wiki.html'); });

app.get('/css/:file', function(req, res) {
	return res.sendFile(__dirname + '/css/' + req.params.file);
});

app.get('/request_token', function(req, res) {
	twitter.getRequestToken(function(err, reqToken, reqSecret) {
		if (err) return res.send(err);
		else {
			req.session.reqSecret = reqSecret;
			req.session.reqToken = reqToken;
			res.redirect('https://api.twitter.com/oauth/authorize?oauth_token=' + reqToken);
		}
	});
});

app.get('/access_token', function(req, res) {
	var reqToken = req.query['oauth_token'];
	var verifier = req.query['oauth_verifier'];

	twitter.getAccessToken(reqToken, req.session.reqSecret, verifier, function(err, accessToken, accessSecret) {
		req.session.accessToken = accessToken;
		req.session.accessSecret = accessSecret;
		if (err) return res.send(err);
		else {
			twitter.verifyCredentials(req.session.accessToken, req.session.accessSecret, function(err, user) {
				req.session.user = user;
				return res.send(user);
			});
		}
	});
});

var transformStringFromDiff = function(d, str) {
	var newStr = '';
	var segs = d.split('\\');
	var ct = 0;
	for (var i = 0; i < segs.length; i++) {
		var t = segs[i].split('|');
		if (t[0] == 'm') {
			newStr = newStr + str.substring(ct, ct + parseInt(t[1]));
			ct += parseInt(t[1]);
		}
		else if (t[0] == 's') {
			ct += parseInt(t[1]);
		}
		else if (t[0] == 'a') {
			newStr += t[1];
		}
	}
	return newStr;
}

var getTextWithTitle = function(session, title, callback) {
	var text = "";
	if (editors[title] == undefined) {
		callback("");
	}
	else {
		var q = 'from:' + editors[title].join(' OR from:');
		twitter.search({
			q: q
		}, session.accessToken, session.accessSecret, function(err, data, response) {
			console.log(data);
			var fin = '';
			data.statuses.sort(function(a, b) {
				return b.id - a.id;
			});
			for (var i = data.statuses.length-1; i >= 0; i--) {
				var d = data.statuses[i].text.split("!@")[0];
				if (d === title) fin = transformStringFromDiff(data.statuses[i].text.split('!@')[1], fin);
			}
			callback(fin);
		});
	}
	
};

app.get('/wiki/:title', function(req, res) {
	if (!req.session.user) return res.redirect('/');
	if (req.params.title === 'home') {
		res.render(__dirname + '/views/page.ejs', {
			title: 'Welcome to Twitterpedia!',
			text: 'Twitterpedia is a user-editable wiki that is hosted by Twitter.\
			 All the pages on this wiki (not including this) are encoded in actual Tweets.'
		});
	}
	else getTextWithTitle(req.session, req.params.title, function(text) {
		res.render(__dirname + '/views/page.ejs', {
			title: req.params.title,
			text: text
		});
	});
});

app.post('/sendedit/:title', function(req, res) {
	if (!req.session.user) return res.redirect('/');
	getTextWithTitle(req.session, req.params.title, function(text) {
		var difference = diff.diffChars(text, req.body.data);
		var d = req.params.title + "!@";
		for (var i = 0; i < difference.length; i++) {
			var currDiff = difference[i];
			if (currDiff.added == undefined && currDiff.removed == undefined) {
				d += 'm|' + currDiff.count + '\\';
			}
			else if (currDiff.added == true) {
				d += 'a|' + currDiff.value + '\\';
			}
			else if (currDiff.removed == true) {
				d += 's|' + currDiff.count + '\\';
			}
		}
		d = d.substring(0, d.length-1);
		if (editors[req.params.title] == undefined) {
			editors[req.params.title] = [req.session.user.screen_name];
		}
		else {
			editors[req.params.title].push(req.session.user.screen_name);
		}
		twitter.statuses('update', {
			status: d
		}, req.session.accessToken, req.session.accessSecret, function(err, data, response) {
			if (err) return res.send(err);
			else {
				res.redirect('http://localhost/wiki/' + req.params.title);
			}
		});
	});
});



app.get('/edit/:title', function(req, res) {
	if (!req.session.user) return res.redirect('/');
	getTextWithTitle(req.session, req.params.title, function(text) {
		res.render(__dirname + '/views/edit.ejs', {
			title: req.params.title,
			text: text
		});
	});
});

app.listen(process.env.PORT | 80);

