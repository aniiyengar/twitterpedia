
var express = require('express');
var twitterAPI = require('node-twitter-api');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var smaz = require('smaz');
var ejs = require('ejs');
var diff = require('diff');
var bodyParser = require('body-parser');
var config = require('./config.js');

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

var wiki = {};

var twitter = new twitterAPI({
	consumerKey: config.consumerKey,
	consumerSecret: config.consumerSecret,
	callback: 'http://localhost/wiki'
});

app.get('/', function(req, res) { res.sendFile(__dirname + '/views/index.html'); });
app.get('/wiki', function(req, res) { res.sendFile(__dirname + '/views/wiki.html'); });

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
	var segs = d.split('||');
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
	twitter.search({
		q: 'from:' + session.user.screen_name
	}, session.accessToken, session.accessSecret, function(err, data, response) {
		var fin = '';
		for (var i = data.statuses.length-1; i >= 0; i--) {
			fin = transformStringFromDiff(data.statuses[i].text, fin);
		}
		callback(fin);
	});
};

app.get('/wiki/:title', function(req, res) {
	getTextWithTitle(req.session, req.params.title, function(text) {
		res.render(__dirname + '/views/page.ejs', {
			title: req.params.title,
			text: text
		});
	});
});

app.post('/sendedit/:title', function(req, res) {
	getTextWithTitle(req.session, req.params.title, function(text) {
		var difference = diff.diffChars(text, req.body.data);
		console.log(difference);
		var d = '';
		for (var i = 0; i < difference.length; i++) {
			var currDiff = difference[i];
			if (currDiff.added == undefined && currDiff.removed == undefined) {
				d += 'm|' + currDiff.count + '||';
			}
			else if (currDiff.added == true) {
				d += 'a|' + currDiff.value + '||';
			}
			else if (currDiff.removed == true) {
				d += 's|' + currDiff.count + '||';
			}
		}
		d = d.substring(0, d.length-2);
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
	getTextWithTitle(req.session, req.params.title, function(text) {
		res.render(__dirname + '/views/edit.ejs', {
			title: req.params.title,
			text: text
		});
	});
});

app.listen(80);

