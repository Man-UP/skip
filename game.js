/*****************************************************************************
 *****************************************************************************
 **                                                                         **
 **  Shared code                                                            **
 **                                                                         **
 *****************************************************************************
 *****************************************************************************/

/*****************************************************************************
 * Constants                                                                 *
 *****************************************************************************/

var SWING_DURATION = 5000;
var JUMP_DURATION = 1000;


/*****************************************************************************
 * Utilities                                                                 *
 *****************************************************************************/

var now = function () {
  return new Date().getTime();
};


/*****************************************************************************
 * Collections                                                               *
 *****************************************************************************/

var Games = new Meteor.Collection('games');
var Players = new Meteor.Collection('players');


/*****************************************************************************
 * Routing                                                                   *
 *****************************************************************************/

Router.map(function () {
    this.route('player', { path: '/' });
    this.route('viewer', { path: '/viewer' });
});


/*****************************************************************************
 * Methods                                                                   *
 *****************************************************************************/

Meteor.methods({
  register: function () {
    return Players.insert({
      lives: 3,
      lastJump: now() - JUMP_DURATION
    });
  },

  jump: function (playerId) {
    if (_.isString(playerId)) {
      var player = Players.findOne(playerId);
      var time = now();
      if (time - player.lastJump > JUMP_DURATION) {
        Players.update(playerId, { $set: { lastJump: time } });
      }
    }
  },

  serverTime: now,
});


/*****************************************************************************
 *****************************************************************************
 **                                                                         **
 **  Client code                                                            **
 **                                                                         **
 *****************************************************************************
 *****************************************************************************/

if (Meteor.isClient) {


  /***************************************************************************
   * Utilities                                                               *
   ***************************************************************************/

  var getPlayer = function () {
    return Players.findOne(Session.get('playerId'));
  };


  /***************************************************************************
   * Routing                                                                 *
   ***************************************************************************/

  Router.configure({
    layout: 'layout',
  });


  /***************************************************************************
   * Templates                                                               *
   ***************************************************************************/

  var baseHelpers = {
    player: getPlayer,
  };

  // player template

  Template.player.created = function () {
     Meteor.call('register', function (error, playerId) {
      if (_.isUndefined(error)) {
        Session.set('playerId', playerId);
      }
    });
  };

  Template.player.helpers(
    _.extend(baseHelpers, {
      isAlive: function () {
        var player = getPlayer();
        if (player) {
          return player.lives > 0;
        }
      }
    })
  );

  // controller template

  Template.controller.helpers(baseHelpers);

  Template.controller.events({
    'click input': function (event) {
      event.preventDefault();
      Meteor.call('jump', Session.get('playerId'));
    }
  });

  // viewer template

  var drawGame = function (ctx) {
    var game = Games.findOne();
    if (_.isUndefined(game) || !_.isNumber(game.lastSwing)) {
      return;
    }
    Meteor.call('serverTime', function (error, serverTime) {
      var lastSwing = game.lastSwing;
      var canvas = ctx.canvas;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      var w = canvas.width;
      var h = canvas.height;
      var swingProg = (serverTime - lastSwing) / SWING_DURATION;
      var y = 2 * Math.abs(h/2 - h*swingProg);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.closePath();
      ctx.stroke();
      var cursor = Players.find({});
      var numPlayers = cursor.count();
      var playerIndex = 0;
      var offset = w / (numPlayers + 1);
      var pW = w * 0.05;
      var pH = h * 0.05;
      var jumpMaxHeight = h * 0.3;
      cursor.forEach(function (player) {
        ctx.fillStyle = (player.lives == 0) ? '#f00' : '#0f0';
        var x = (playerIndex + 1) * offset;
        var lastJump = player.lastJump;
        var jumpHeight = 0;
        if (lastJump) {
          diff = serverTime - lastJump
          if (diff < JUMP_DURATION) {
            var jumpProg = diff / JUMP_DURATION;
            jumpHeight = jumpMaxHeight - (2 * Math.abs((jumpMaxHeight / 2) -
                jumpMaxHeight * jumpProg));
          }
        }
        ctx.fillRect(x - pW / 2, h - pH - jumpHeight, pW, pH);
        playerIndex++;
      });
    });
  };

  Template.viewer.rendered = function () {
    /* If this the first time the viewer has been rendered, start the
     * draw loop.
     */
    if (_.isUndefined(this.started)) {
      this.started = true;
      var canvas = document.getElementById('view');
      var ctx = canvas.getContext('2d');
      Meteor.setInterval(function () {
        drawGame(ctx);
      }, 1000 / 30);
    }
  };

}


/*****************************************************************************
 *****************************************************************************
 **                                                                         **
 **  Server code                                                            **
 **                                                                         **
 *****************************************************************************
 *****************************************************************************/

if (Meteor.isServer) {
  var getGame = function () {
    return Games.findOne();
  };

  var swing = function () {
    // The time the rope hits the floor and the new swing starts
    var swing = now();

    // Save the swing time
    Games.update(getGame()._id, { $set: { lastSwing: swing } });

    /* Find players that are alive and are not jumping when the rope
     * hits the floor and deduct a life.
     */
    Players.update({
      lives: { $gt: 0 },
      lastJump:{ $lte: swing - JUMP_DURATION }
    }, {
      $inc: { lives: -1 }
    }, {
      multi: true
    });
  };

  // Called when the server starts
  Meteor.startup(function () {
    // Ensure there is a single game
    Games.remove({});
    Games.insert({});

    // Remove old players
    Players.remove({});

    // Start swinging the rope
    swing();
    Meteor.setInterval(swing, SWING_DURATION);
  });

}

