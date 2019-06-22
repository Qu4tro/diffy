var express = require('express');
var cors = require('cors')
var bodyParser = require('body-parser');
var diff2html = require('diff2html');
var fs = require('fs');
var utils = require('./utils.js').Utils;
var mongoUtils = require('./mongoUtils.js');
var FileTree = require('./treeFunctions.js').FileTree;
var multer  = require('multer');
var flash = require('connect-flash');
var cookieParser = require('cookie-parser');
var config = require('./config');
var session = require('express-session');
var MongoStore = require('connect-mongodb-session')(session);
var path = require('path');

const PROJECT_ROOT   = path.join(__dirname + '/../../../');
// const STATICS_FOLDER = path.join(PROJECT_ROOT, 'frontend/dist/ngdiffy');
const INDEX_FILE     = path.join(PROJECT_ROOT + '/frontend/dist/ngdiffy/index.html');

import { MongoSharedDiffRepository } from './v2/SharedDiffRepository/MongoSharedDiffRepository';
import { GetSharedDiffAction } from './v2/GetSharedDiffAction';
import { CreateSharedDiffAction } from './v2/CreateSharedDiffAction';
import { CreateSharedDiffAPIAction } from './v2/CreateSharedDiffAPIAction';
import { DeleteSharedDiffAction } from './v2/DeleteSharedDiffAction';
import { SharedDiff } from './v2/SharedDiff';
//import { LogBasedMetrics } from './v2/Metrics/LogBasedMetrics';
import { GAMetrics } from './v2/Metrics/GAMetrics';


var corsOptions = {
  origin: 'http://localhost:4200',
}

var upload = multer({ storage: multer.memoryStorage() });
var app = express();
const repo = new MongoSharedDiffRepository(config.db_url, config.db_name);
repo.connect();

if (! config.GA_ANALITYCS_KEY) {
    throw new Error("GA_ANALYTICS_KEY has to be present");
}

app.use(cors(corsOptions))
app.options('*', cors(corsOptions)) // include before other routes

// app.use('/assets', express.static(STATICS_FOLDER));
// app.use('/', express.static(STATICS_FOLDER));
app.use(bodyParser.json({limit: config.MAX_DIFF_SIZE}));
app.use (diffTooBigErrorHandler);

function diffTooBigErrorHandler (err: any, req: any, res: any, next: any) {
    if (err.type == "entity.too.large") {
        res.status(400).send({ error: "The diff is to big, the limit is " + config.MAX_DIFF_SIZE })
    } else {
        next(err)
    }
}

app.use(cookieParser(config.session_secret));
app.use(session({
    cookie: { maxAge: 60000 },
    resave: false,
    saveUninitialized: false,
    secret: config.session_secret,
    store: new MongoStore({
        uri: config.db_url,
        collection: config.session_collection,
    })
}));
app.use(flash());

app.delete('/api/diff/:id', function (req: any, res: any) {
    var id = req.params.id;
    const metrics = new GAMetrics(config.GA_ANALITYCS_KEY, req.cookies._ga || config.GA_API_DEFAULT_KEY);
    var action = new DeleteSharedDiffAction(repo, metrics);
    return action.deleteSharedDiff(id)
        .then((deletedRowsCount) => {
            if(deletedRowsCount > 0) {
                res.send(JSON.stringify({success: true}));
            } else {
                res.status(404);
                res.send({success: false, error: "No documents found to delete"});
            }
        },
        (err: any) => {
            console.error(err);
            res.status(400);
            res.send(JSON.stringify({success: false}));
        });
});

app.get('/api/diff/:id', function (req: any, res: any) {
    var id = req.params.id;
    const metrics = new GAMetrics(config.GA_ANALITYCS_KEY, req.cookies._ga || config.GA_API_DEFAULT_KEY);
    var action = new GetSharedDiffAction(repo, metrics);
    action.getSharedDiff(id)
        .then((shared_diff: SharedDiff) => {
            var jsonDiff = shared_diff.diff;
            jsonDiff = jsonDiff.sort(utils.sortByFilenameCriteria);
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({
                id        : shared_diff.id,
                expiresAt : shared_diff.expiresAt,
                created   : shared_diff.created,
                rawDiff   : shared_diff.rawDiff,
            }));
        },
        (err: any) => {
            res.status(404);
            res.send('404 Sorry, the requested page was not found, create one at <a href="http://diffy.org">http://diffy.org</a>');
        }
    );
});

app.put('/api/diff', function (req: any, res: any) {
    try {
        var diffRequest = req.body;
        var diff = diffRequest.diff || '';
        diff = diff.replace(/\r/g, '');
    } catch (e) {
        res.status(400);
        res.send({error: "Invalid input"});
        return;
    }
    // remove \r
    // end of param cleaning

    const metrics = new GAMetrics(config.GA_ANALITYCS_KEY, req.cookies._ga || config.GA_API_DEFAULT_KEY);
    const action = new CreateSharedDiffAction(repo, metrics);
    if(! action.isValidRawDiff(diff)) {
        res.status(400);
        res.send({error: 'Diff is not valid'});
        return;
    }
    const shared_diff = action.createSharedDiff(diff);
    return action.storeSharedDiff(shared_diff)
        .then((obj: SharedDiff) => {
            if (!obj.id) {
                console.warn("new: undefined obj id");
            }
            res.send(obj);
        });
});

app.get('/diff_download/:id', function (req: any, res: any) {
    var id = req.params.id;
    mongoUtils.getDiffById(id, function(row: any) {
        if (row === null) {
            res.status(404);
            res.send('404 Sorry, the requested page was not found, create one at <a href="http://diffy.org">http://diffy.org</a>');
            return;
        }
        var rawDiff = row.rawDiff;
        res.setHeader('Content-disposition', 'attachment; filename=' + id + '.diff');
        res.setHeader('Content-type', 'text/plain');
        res.send(rawDiff);
    });
});

// app.get('*', function (req: any, res: any) {
//     res.sendFile(INDEX_FILE);
// });



var server = app.listen(config.port, config.host, function () {
    var host = server.address().address;
    var port = server.address().port;

    console.log('App.ts listening at http://%s:%s', host, port);
});

app.use(function(err: any, req: any, res: any, next: any) {
      console.error(err.stack);
        res.status(500).send('Something broke!');
});

// Make sure we exit gracefully when we receive a SIGINT signal (eg. from Docker)
process.on('SIGINT', function() {
    repo.disconnect();
    process.exit();
});
