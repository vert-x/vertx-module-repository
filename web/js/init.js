var sid;
var currentModId = 0;

function fillLatestApprovedMods() {
  $.getJSON('/latest-approved-modules', function(data) {
    $('#latestApprovedModules').empty();
    $('#latestApprovedModules').append(getLiFromMods(data.modules));
  });
}

function isLoggedIn() {
  return typeof sid !== 'undefined';
}

function bulletsFromList(list, style) {
  var ul = $('<ul class="' + style + '" />');
  $.each(list, function(i) {
    ul.append('<li>' + list[i] + '</li>');
  });
  return ul;
}

function createModuleDiv(item) {
  var clicker, div, infos, keywords, licenses, time;

  function bullet(key, value) {
    var li, spanKey, spanValue;
    li = $('<li class="info" />');
    spanKey = $('<span class="key" />').text(key);
    spanValue = $('<span class="value" />');
    if (typeof value !== 'undefined') {
      spanValue.text(value);
    }
    li.append(spanKey);
    li.append(spanValue);

    return {
      li : li,
      key : spanKey,
      value : spanValue
    };
  }

  extraInfos = $('<div class="extraInfos" id="extraInfos-' + item._id + '" />');
  if (isLoggedIn()) {
    
  }
  infos = $('<ul class="infos" />');
  infos.append(bullet('Name', item.name).li);
  infos.append(bullet('Description', item.description).li);
  infos.append(bullet('Author', item.author).li);
  if (item.downloadUrl != null) {
    infos.append(bullet('Download-URL', item.downloadUrl).li);
  }
  infos.append(bullet('Homepage', item.homepage).li);

  licenses = bullet('Licenses');
  licenses.value.append(bulletsFromList(item.licenses, 'licenses'));
  infos.append(licenses.li);

  keywords = bullet('Keywords');
  keywords.value.append(bulletsFromList(item.keywords, 'keywords'));
  infos.append(keywords.li);

  extraInfos.append(infos);

  if (item.timeApproved != -1) {
    time = item.timeApproved;
  } else {
    time = item.timeRegistered;
  }

  div = $('<div class="modname"><span class="date">' + formatTimestamp(time) + '</span></div>');
  clicker = $('<a href="#">' + item.name + '</a>');

  /*
   * { "downloadUrl":null, "name":"io.vertx~mod-mongo-persistor~2.0.0-beta2",
   * "description":"MongoDB persistor module for Vert.x", "licenses":["The
   * Apache Software License Version 2.0"], "author":"purplefox",
   * "homepage":"https://github.com/vert-x/mod-mongo-persistor",
   * "keywords":["mongo","mongodb","database","databases","persistence","json","nosql"],
   * "_id":"7fc57796-28f9-49b4-b346-d9361501a78f",
   * "timeRegistered":1369216883259, "timeApproved":-1, "approved":true }
   */

  clicker.click(extraInfos, function(event) {
    event.preventDefault();
    event.data.fadeToggle();
  });

  div.append(clicker);
  div.append(extraInfos);

  return div;
}

function getLiFromMods(modules) {
  var div, item, items = $('<ul />'), time;
  while (modules.length) {
    item = modules.pop();

    itemResult = $('<li class="module" id="searchResult-' + item._id + '" />');
    div = createModuleDiv(item);
    console.log(JSON.stringify(item));
    itemResult.append(div);

    items.append(itemResult);
  }

  return items;
}

function formatTimestamp(time) {
  function twoDigits(num) {
    if (num < 10)
      return '0' + num;
    else
      return num;
  }

  var date = new Date(time);
  var months = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];
  var year = date.getFullYear();
  var month = months[date.getMonth()];
  var day = date.getDate();
  var hour = date.getHours();
  var min = date.getMinutes();
  var sec = date.getSeconds();
  var time = twoDigits(day) + ' ' + month + ' ' + year + ' ' + twoDigits(hour) + ':'
      + twoDigits(min) + ':' + twoDigits(sec);

  return time;
}

function createSearchFormSubmitHandler() {
  $('#searchForm').submit(function(event) {
    event.preventDefault();
    $('#searchButton').attr('disabled', true);
    $('#searchButton').text('Searching ...');
    $.post('/search', {
      query : $('#query').val()
    }, function(data) {
      $('#searchButton').attr('disabled', false);
      $('#searchButton').text('Search');
      $('#searchResults').empty();
      if ($.isEmptyObject(data.modules)) {
        $('#searchResults').append('<p>Sorry, I couldn\'t find anything :(</p>');
      } else {
        $('#searchResults').append(getLiFromMods(data.modules));
      }
      $('#searchResultContainer').show();
    }, 'json');
  });
}

function createListFormSubmitHandler() {
  $('#listForm').submit(function(event) {
    event.preventDefault();
    $('#listButton').attr('disabled', true);
    $('#listButton').text('Retrieving List ...');
    $.get('/list', {}, function(data) {
      $('#listButton').attr('disabled', false);
      $('#listButton').text('List All Modules');
      $('#searchResults').empty();
      if ($.isEmptyObject(data.modules)) {
        $('#searchResults').append('<p>Sorry, I couldn\'t find anything :(</p>');
      } else {
        $('#searchResults').append(getLiFromMods(data.modules));
      }
      $('#searchResultContainer').show();
    }, 'json');
  });
}

function createRegisterFormHandler() {
  function showRegisterForm() {
    $('#registerFormContainer').show();
    displayHideLink();
    return false;
  }

  function displayHideLink() {
    $('a.showRegister').replaceWith('<a class="hideRegister href-less">registration form</a>')
    $('a.hideRegister').click(function() {
      $('#registerFormContainer').hide();
      displayShowLink();
    });
  }

  function displayShowLink() {
    $('a.hideRegister').replaceWith('<a class="showRegister href-less">registration form</a>')
    $('a.showRegister').click(showRegisterForm);
  }

  function showInfoMessage(message) {
    $('#register .error').hide();
    $('#register .info').show();
    $('#register .info .message').html(message);
  }

  function showErrorMessage(message) {
    $('#register .info').hide();
    $('#register .error').show();
    $('#register .error .message').html(message);
  }

  function processRegisterResult(json) {
    $('#registerButton').attr('disabled', false);
    $('#registerButton').text('Submit for moderation');
    if (json.status === 'ok') {
      showInfoMessage('<p>Module \''
          + json.data.name
          + '\' submitted for moderation</p>'
          + ((json.mailSent) ? '<p>The moderators have been notified!</p>'
              : '<p>Could not notify moderators, please notify them through IRC or on the mailing list to get your module approved quickly.</p>'));
    } else if (json.status === 'error') {
      showErrorMessage(json.message);
    }
  }

  $('a.showRegister').click(showRegisterForm);
  $('#registerForm .message').hide();

  $('#registerForm').submit(function(event) {
    event.preventDefault();
    $('#registerButton').attr('disabled', true);
    $('#registerButton').text('Checking validity of module...');
    $.post('/register', {
      modName : $('#registerFormModName').val(),
      modLocation : $('#registerFormModLocation').val(),
      modURL : $('#registerFormModURL').val()
    }, processRegisterResult, 'json');
  });
}

function createUnapprovedModsHandler() {
  var loginContainer = '#loginContainer';

  function resetLoginForm() {
    $(loginContainer + ' #password').val('');
    $(loginContainer + ' .errorMessage').hide();
  }

  function hideLoginForm() {
    $(loginContainer).fadeOut(300);
    $('#mask').fadeOut(300, function() {
      $(this).remove();
    });
  }

  function showLoginErrorMessage(error) {
    if ($(loginContainer).is(':hidden')) {
      resetLoginForm();
      showLoginForm();
    }
    $(loginContainer + ' .errorMessage').show().html(error);
  }

  function showLoginForm() {
    $(loginContainer).fadeIn(300);
    $('#password').focus();

    // Align the box
    var margTop = $(loginContainer).height() / 2;
    var margLeft = $(loginContainer).width() / 2;

    $(loginContainer).css({
      'margin-top' : -margTop,
      'margin-left' : -margLeft
    });

    // Add mask to hide the background
    $('body').append('<div id="mask"></div>');
    $('#mask').fadeIn(300);

    $("#mask").click(function() {
      hideLoginForm()
      return false;
    });
  }

  $('a.showUnapproved').click(showUnapproved);

  function showUnapproved() {
    if (sid) {
      getUnapproved()
    } else {
      resetLoginForm();
      showLoginForm();
    }

    return false;
  }

  $('a.close').click(function() {
    hideLoginForm();
    return false;
  });

  $('#loginForm').submit(function(event) {
    event.preventDefault();
    $('#loginButton').attr('disabled', true);
    $('#loginButton').text('Logging in ...');
    $.post('/login', {
      password : $('#password').val()
    }, processLoginResult, 'json');
  });

  function processLoginResult(data) {
    $('#loginButton').attr('disabled', false);
    $('#loginButton').text('Login');

    if (data.status == 'ok' && data.sessionID) {
      sid = data.sessionID;
      getUnapproved();
    } else if (data.status == 'error') {
      processStatusError(data);
    } else if (data.status == 'denied') {
      showLoginErrorMessage("Wrong password");
    } else {
      showLoginErrorMessage("Access denied");
    }
  }

  function getUnapproved() {
    $.getJSON('/unapproved', {
      sessionID : sid
    }, function(data) {
      if (data.modules) {
        $('#unapprovedModules').empty();
        $('#unapprovedModules').append(getLiFromMods(data.modules));
        appendButtons('#unapprovedModules');
        hideLoginForm();
        displayHideLink();
      } else if (data.status == 'denied') {
        showLoginErrorMessage("Bad session or session expired");
      } else {
        showLoginErrorMessage("Internal error");
      }
    });
  }

  function appendButtons(container) {
    $(container + ' .mod')
        .append(
            '<div class="buttons"><a class="approve" href="#"><img  src="images/approve.png" title="Approve" alt="Approve" /></a><a class="deny" href="#"><img title="Deny"  src="images/deny.png" alt="Deny" /></a></div>')

    $(container + ' .buttons .approve').attr('href', function(index, oldAttr) {
      return '#' + $(this).parents('.mod').attr('id');
    }).click(function(event) {
      event.preventDefault();

      var mod = $(this).attr('href');
      var modId = $(mod).attr('id');

      $("#dialogConfirmApprove").dialog({
        resizable : false,
        modal : true,
        buttons : {
          "Yes, I'm sure!" : function() {
            $(this).dialog("close");
            approve(modId);
          },
          Cancel : function() {
            $(this).dialog("close");
          }
        }
      });
    });

    $(container + ' .buttons .deny').attr('href', function(index, oldAttr) {
      return '#' + $(this).parents('.mod').attr('id');
    }).click(function(event) {
      event.preventDefault();

      var mod = $(this).attr('href');
      var modId = $(mod).attr('id');

      $("#dialogConfirmDeny").dialog({
        resizable : false,
        modal : true,
        buttons : {
          "Yes, I'm sure!" : function() {
            $(this).dialog("close");
            deny(modId);
          },
          Cancel : function() {
            $(this).dialog("close");
          }
        }
      });
    });
  }

  function deny(modId) {
    alert("For now, just assume the mod has been denied!")
    $('#' + modId).fadeOut(1000, function() {
      $(this).remove();
      fillLatestApprovedMods();
    })

    // $.post('/deny', {
    // sessionID : sid,
    // _id : modId
    // }, function(data) {
    // processDenyResult(data)
    // }, 'json');
  }

  function approve(modId) {
    $.post('/approve', {
      sessionID : sid,
      _id : modId
    }, function(data) {
      processApproveResult(data)
    }, 'json');
  }

  function processApproveResult(json) {
    if (json.status == 'ok')
      $('#' + json._id).fadeOut(1000, function() {
        $(this).remove();
        fillLatestApprovedMods();
      })
  }

  function displayHideLink() {
    $('a.showUnapproved').replaceWith('<a class="hideUnapproved href-less">[Hide]</a>')
    $('a.hideUnapproved').click(function() {
      $('#unapprovedModules').empty();
      displayShowLink();
    });
  }

  function displayShowLink() {
    $('a.hideUnapproved').replaceWith('<a class="showUnapproved href-less">[Show]</a>')
    $('a.showUnapproved').click(showUnapproved);
  }

  function processStatusError(data) {
    var s = 'Missing password';
    var messages = data.messages;
    if (messages.length > 0) {
      s = messages.pop();
      while (messages.length) {
        s += '<br />' + messages.pop();
      }
    }
    showLoginErrorMessage(s);
  }
}

function generateName() {
  var nameA = [ "awesome", "amazing", "fantastic", "marvelous", "storming", "staggering",
      "exciting", "mind-blowing", "astonishing", "handsome", "beautiful", "admirable", "lovely",
      "gorgeous", "exceptional", "uncommon", "terribly nice", "outstanding", "fine-looking",
      "well-favored", "glorious", "pulchritudinous", "ravishing", "stunning", "dazzling",
      "mind-boggling", "attractive", "graceful", "pleasing", "charismatic", "enchanting" ];
  var nameB = [ "men", "guys", "dudes", "fellows", "jossers", "wallahs", "blokes", "fellas",
      "fellers", "chaps", "lads", "people", "humans", "geezers", "boys", "gorillas", "bananas",
      "champs", "rockers", "pals" ];
  var a = Math.floor(Math.random() * nameA.length);
  var b = Math.floor(Math.random() * nameB.length);
  var name = nameA[a] + ' ' + nameB[b];
  return name;
}

function fillName() {
  $('#footer .randomName').text(generateName());
}

$(document).ready(function() {
  createRegisterFormHandler();
  createUnapprovedModsHandler();
  fillLatestApprovedMods();
  createSearchFormSubmitHandler();
  createListFormSubmitHandler();
  fillName();
});