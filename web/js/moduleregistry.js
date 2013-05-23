var entriesPerPage, errorDialog, lastSearch, moduleCount, processSearchResults, searchPage, sessionID;

entriesPerPage = 2;
searchPage = 0;

function showDialog(dialog, text, refreshSearch) {
  var jqDialog = $('#' + dialog + 'Dialog');
  $('#mask').fadeIn();
  jqDialog.show();
  if (text) {
    jqDialog.find('.text').show();
    jqDialog.find('.text').html(text);
  } else {
    jqDialog.find('.text').hide();
  }
  if (!!refreshSearch) {
    searchIt(lastSearch);
  }
}

function dismissDialog(dialog) {
  var jqDialog = $('#' + dialog + 'Dialog');
  $('#mask').fadeOut();
  jqDialog.hide();
}

function dialogs() {
  var theDialogs = $('.dialog');
  $('.dialog').each(function(index) {
    var that = $(this);
    that.find('.close').click(function(e) {
      e.preventDefault();
      that.hide();
      $('#mask').fadeOut();
    });
  });

  $('.help').each(function(index) {
    var that = $(this);
    that.find('.controls').click(function(e) {
      e.preventDefault();
      that.find('.text').slideToggle();
    })
  });
}

function isAuthed() {
  return typeof sessionID !== 'undefined';
}

function formatTime(time) {
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

function searchIt(query) {
  console.log('search for: ' + JSON.stringify(query));
  lastSearch = query;
  lastSearch.params.limit = entriesPerPage;
  lastSearch.params.skip = searchPage * entriesPerPage;
  if (query.method === 'post') {
    $.post(query.url, query.params, processSearchResults(query.title), 'json');
  } else {
    $.getJSON(query.url, query.params, processSearchResults(query.title));
  }
}

function countModules() {
  var mc = $('#moduleCount');

  mc.click(function(e) {
    e.preventDefault();
    $.getJSON('/count', function(reply) {
      if (reply.status === 'ok') {
        moduleCount = reply.count;
      } else {
        moduleCount = 0;
      }
      mc.text(moduleCount);
    });
  });
  mc.click();
}

function authentication() {
  var loginErrors;
  loginErrors = $('#loginDialog .text');

  function setLoggedIn(isAuthenticated) {
    var authed, unauthed, i, rule, rules, sIdx, ss;
    for (sIdx = document.styleSheets.length - 1; sIdx >= 0; sIdx--) {
      ss = document.styleSheets[sIdx];
      rules = ss.cssRules || ss.rules;

      for (i = rules.length - 1; i >= 0; i--) {
        rule = rules[i];
        if (/(^|,) *.authed *(,|$)/i.test(rule.selectorText)) {
          authed = rule;
        }
        if (/(^|,) *.unauthed *(,|$)/i.test(rule.selectorText)) {
          unauthed = rule;
        }

        if (authed && unauthed) {
          break;
        }
      }

      if (authed && unauthed) {
        break;
      } else {
        authed = false;
        unauthed = false;
      }
    }

    if (authed && unauthed && !!isAuthenticated) {
      authed.style.display = '';
      unauthed.style.display = 'none';
    } else if (authed && unauthed && !isAuthenticated) {
      authed.style.display = 'none';
      unauthed.style.display = '';
    }
  }

  $('#loginBtn').click(function() {
    showDialog('login');
  });

  $('#submitLoginBtn').click(function(e) {
    e.preventDefault();
    $.post('/login', {
      password : $('#loginFormPassword').val()
    }, function(data) {
      loginErrors.hide();
      if (data.status === 'ok') {
        sessionID = data.sessionID;

        setLoggedIn(true);

        dismissDialog('login');
      } else if (data.status === 'error') {
        loginErrors.text(data.messages.join(', '));
        loginErrors.fadeIn();
      } else if (data.status === 'denied') {
        loginErrors.text('Access denied. Wrong password?');
        loginErrors.fadeIn();
      }
    }, 'json');
  });

  $('#logoutBtn').click(function(e) {
    e.preventDefault();
    $.post('/logout', {
      'sessionID' : sessionID
    }, function(data) {
      if (data.status === 'ok') {
        setLoggedIn(false);

        showDialog('info', 'Successfully logged out.', true);
      } else {
      }
    }, 'json');
  });
}

function searching() {
  var searchFor = $('#searchFor');
  var desc = 1;
  var sortBy = 'timeRegistered';

  $('#searchModules').click(function(e) {
    e.preventDefault();
    searchIt({
      'url' : '/search',
      'method' : 'post',
      'title' : 'Search results',
      'params' : {
        'query' : searchFor.val(),
        'by' : sortBy,
        'desc' : desc
      }
    });
  });

  function validSearchPage(a) {
    var min = 0
    var max = Math.max(0, (moduleCount / entriesPerPage) - 1);
    searchPage = Math.max(min, Math.min(max, a));
    if (searchPage === min) {
      $('#pagerLeft').attr('disabled', true);
    } else {
      $('#pagerLeft').attr('disabled', false);
    }
    if (searchPage === max) {
      $('#pagerRight').attr('disabled', true);
    } else {
      $('#pagerRight').attr('disabled', false);
    }
    return searchPage;
  }

  $('#pagerLeft').click(function(e) {
    e.preventDefault();
    searchPage = validSearchPage(searchPage - 1);
    searchIt(lastSearch);
  });

  $('#pagerRight').click(function(e) {
    e.preventDefault();
    searchPage = validSearchPage(searchPage + 1);
    searchIt(lastSearch);
  });

  function updateSort() {
    lastSearch.params.by = sortBy;
    lastSearch.params.desc = desc;
    return lastSearch;
  }

  $('#byName').click(function(e) {
    e.preventDefault();
    if (sortBy === 'name') {
      desc = (desc + 1) % 2;
    } else {
      sortBy = 'name';
      validSearchPage(0);
      desc = 0;
    }
    $(this).html('Sort by Name ' + ((desc === 0) ? '&#8593;' : '&#8595;')).addClass('active');
    $('#byDate').html('Sort by Date').removeClass('active');
    searchIt(updateSort());
  });

  $('#byDate').click(function(e) {
    e.preventDefault();
    if (sortBy === 'timeRegistered') {
      desc = (desc + 1) % 2;
    } else {
      sortBy = 'timeRegistered';
      validSearchPage(0);
      desc = 1;
    }
    $(this).html('Sort by Date ' + ((desc === 0) ? '&#8593;' : '&#8595;')).addClass('active');
    $('#byName').html('Sort by Name').removeClass('active');
    searchIt(updateSort());
  });

  $('#listAllModules').click(function(e) {
    e.preventDefault();
    searchIt({
      'url' : '/list',
      'title' : 'All modules',
      'params' : {
        'by' : sortBy,
        'desc' : desc
      }
    });
  });

  $('#listUnapprovedModules').click(function(e) {
    e.preventDefault();
    $.post('/unapproved', {
      'sessionID' : sessionID
    }, processSearchResults('All unapproved modules'), 'json');
  });
}

function registering() {
  var oldButtonText = $('#registerButton').html();

  $('#registrationLink').click(function(e) {
    e.preventDefault();
    $('#registrationFormContainer').slideToggle();
  });

  $('#registerButton').click(
      function(e) {
        e.preventDefault();
        var params = {
          'modName' : $('#registerFormName').val(),
          'modLocation' : $('#registerForm input[name="location"]:checked').val()
        };
        if (!$('#registerFormAdditionalURL').is(':disabled')) {
          params.modURL = $('#registerFormAdditionalURL').val();
        }
        $('#registerButton').attr('disabled', true);
        $('#registerButton').text('Checking validity of module ...');
        $.post('/register', params, function(reply) {
          $('#registerButton').attr('disabled', false);
          $('#registerButton').html(oldButtonText);
          if (reply.status === 'ok') {
            var text = '<p>' + reply.data.name + ' was successfully submitted for moderation.</p>';
            if (reply.mailSent) {
              text += '<p>The moderators have been notified!</p>';
            } else {
              text += '<p>Could not notify moderators, please notify them through IRC'
                  + ' or via the mailing list to get your module approved quickly.</p>';
            }
            showDialog('info', text, true);
          } else if (reply.status === 'error') {
            if (reply.message) {
              showDialog('error', reply.message);
            } else {
              showDialog('error', '<ul><li>' + reply.messages.join('</li><li>') + '</li></ul>');
            }
          }
        }, 'json');
      });

  function checkAdditionalInfos() {
    var value = $(this).val();
    $('#registerFormAdditionalURL').attr('disabled', false);
    if (value === 'mavenCentral') {
      $('#registrationFormAdditional .label').text('No additional information needed');
      $('#registerFormAdditionalURL').slideUp();
      $('#registerFormAdditionalURL').attr('disabled', true);
    } else if (value === 'mavenCustom') {
      $('#registrationFormAdditional .label').text('Maven prefix URL');
      $('#registerFormAdditionalURL').slideDown();
      $('#registerFormAdditionalURL').attr('placeholder', 'http://maven.my-company.com/maven2/');
    } else if (value === 'bintray') {
      $('#registrationFormAdditional .label').text('No additional information needed');
      $('#registerFormAdditionalURL').attr('disabled', true);
      $('#registerFormAdditionalURL').slideUp();
    } else { // other url
      $('#registrationFormAdditional .label').text('Download URL for the mod.zip');
      $('#registerFormAdditionalURL').slideDown();
      $('#registerFormAdditionalURL')
          .attr('placeholder', 'http://www.my-company.com/my-module.zip');
    }
  }
  $('input[name="location"]', '#registerForm').change(checkAdditionalInfos);
  $('input[name="location"]:checked', '#registerForm').change();
}

function fillWithLatestAdditions() {
  searchIt({
    'url' : '/list',
    'title' : 'Latest additions',
    'params' : {
      'by' : 'timeRegistered',
      'desc' : 1
    }
  });
}

function initSearchResultProcessor() {
  return (function() {
    var searchedForText = $('#searchedForText');
    var error = $('#searchResults').find('.error');
    var noResults = $('#searchResults').find('.noResults');
    var results = $('#results');
    var resultsUl = $('#results ul');
    var resultControls = $('#resultControls');
    var pagerControls = $('#pagerControls');
    var searchResultTemplate = $('#results').find('.template').clone();

    return function(title) {
      return function(data) {
        noResults.hide();
        error.hide();
        results.hide();
        resultControls.hide();
        pagerControls.hide();

        if (data.status === 'error') {
          error.text(data.messages.join(', '));
          error.fadeIn();
        } else if (data.modules) {
          searchedForText.text(title);
          if (data.modules.length == 0) {
            noResults.show();
          } else {
            resultControls.show();
            pagerControls.show();

            resultsUl.empty();
            $.each(data.modules, function(k, module) {
              var approveImage, approveLink, removeImage, removeLink;
              var tmpl = searchResultTemplate.clone(false);
              tmpl.removeClass('template');
              tmpl.addClass('result');
              var extraInfos = tmpl.find('.extraInfos');
              extraInfos.attr('id', 'extraInfo-' + module._id);
              var controls = extraInfos.find('.extraInfoControls');
              if (!module.approved) {
                approveLink = $('<a class="approveLink" />');
                approveImage = $('<img src="images/approve.png" />');
                approveLink.append(approveImage);
                approveLink.click(function(e) {
                  e.preventDefault();
                  $.post('/approve', {
                    'sessionID' : sessionID,
                    '_id' : module._id
                  }, function(reply) {
                    if (reply.status === 'ok') {
                      showDialog('info', 'The module was approved!', true);
                    } else {
                      showDialog('error', 'Could not approve: ' + reply.messages.join(', '));
                    }
                  }, 'json');
                });
                approveLink.appendTo(controls);
              }
              removeLink = $('<a class="removeLink" />');
              denyImage = $('<img src="images/deny.png" />');
              removeLink.append(denyImage);
              removeLink.click(function(e) {
                e.preventDefault();
                $.post('/remove', {
                  'sessionID' : sessionID,
                  'name' : module.name
                }, function(reply) {
                  if (reply.status === 'ok') {
                    showDialog('info', 'The module was removed!', true);
                  } else {
                    showDialog('error', 'Could not remove: ' + reply.messages.join(', '));
                  }
                }, 'json');
              });
              removeLink.appendTo(controls);

              var infoPart = extraInfos.find('.infoPart').clone(false);
              var infosUl = extraInfos.find('ul').empty();

              function addPart(key, value) {
                var part = infoPart.clone(false);
                part.find('.key').text(key);
                part.find('.value').text(value);
                infosUl.append(part);
              }

              tmpl.find('.name').text(module.name);
              tmpl.find('.registered').text(formatTime(module.timeRegistered));
              tmpl.click(function(e) {
                e.preventDefault();
                $('#extraInfo-' + module._id).toggle();
              });

              addPart('Name', module.name);
              addPart('Description', module.description);
              addPart('Author', module.author);
              addPart('Licenses', module.licenses.join(', '));

              if (module.homepage) {
                addPart('Homepage', module.homepage);
              }
              if (module.developers) {
                addPart('Developers', module.developers.join(', '));
              }
              if (module.keywords) {
                addPart('Keywords', module.keywords.join(', '));
              }

              resultsUl.append(tmpl);
            });

            results.show();
          }
        } else {
          error.text('Something unexpected happened! :O');
          error.fadeIn();
        }
      };
    }
  }());
}

$(function() {
  processSearchResults = initSearchResultProcessor();
  countModules();
  authentication();
  searching();
  registering();
  fillWithLatestAdditions();
  dialogs();
});
