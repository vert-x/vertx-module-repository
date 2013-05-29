var entriesPerPage, errorDialog, lastSearch, moduleCount, processSearchResults, searchMaxModules, searchPage = 0, sessionID = null;

entriesPerPage = 15;

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
    searchIt(lastSearch, true);
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
  return sessionID !== null;
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

function searchIt(query, searchUpdated) {
  var countParams, getStuff, sessionId, skip;
  $('#searchedForText').addClass('loading');
  $('#searchResults').slideUp();
  lastSearch = query;
  lastSearch.params.limit = entriesPerPage;
  lastSearch.params.skip = searchPage * entriesPerPage;

  if (!searchUpdated) {
    if (lastSearch.method === 'post') {
      $.post(lastSearch.url, lastSearch.params, processSearchResults(lastSearch.title), 'json');
    } else {
      $.getJSON(lastSearch.url, lastSearch.params, processSearchResults(lastSearch.title));
    }
  } else {
    sessionId = lastSearch.params.sessionID;
    skip = lastSearch.params.skip;

    delete lastSearch.params.sessionID;
    delete lastSearch.params.skip;

    countParams = lastSearch.params;

    countParams.unapproved = (query.url === '/unapproved') ? 1 : 0;
    $.getJSON('/count', countParams, function(reply) {
      if (reply.status === 'ok') {
        searchMaxModules = reply.count;
      } else {
        searchMaxModules = moduleCount;
      }

      validSearchPage(searchPage);
      lastSearch.params.skip = searchPage * entriesPerPage;

      if (lastSearch.method === 'post') {
        $.post(lastSearch.url, lastSearch.params, processSearchResults(lastSearch.title), 'json');
      } else {
        $.getJSON(lastSearch.url, lastSearch.params, processSearchResults(lastSearch.title));
      }
    });

    lastSearch.params.sessionID = sessionId;
    lastSearch.params.skip = searchPage * entriesPerPage;
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
      $('#moduleCount').text(moduleCount);
    });
  });
  mc.click();
}

function validSearchPage(a) {
  var firstPage = 0;
  var lastPage = Math.max(0, Math.ceil(searchMaxModules / entriesPerPage) - 1);
  searchPage = Math.max(firstPage, Math.min(lastPage, a));
  if (searchPage === firstPage) {
    $('#pagerLeft').attr('disabled', true);
  } else {
    $('#pagerLeft').attr('disabled', false);
  }
  if (searchPage === lastPage) {
    $('#pagerRight').attr('disabled', true);
  } else {
    $('#pagerRight').attr('disabled', false);
  }

  $('#pagerPage').val(searchPage + 1);

  return searchPage;
}

function authentication() {
  var loginErrors;
  loginErrors = $('#loginDialog .text');

  $('#loginBtn').click(function() {
    showDialog('login');
  });

  $('#submitLoginBtn').click(function(e) {
    e.preventDefault();
    $.post('/login', {
      password : $('#loginFormPassword').val()
    }, function(data) {
      loginErrors.hide();
      $('#loginFormPassword').val('');
      if (data.status === 'ok') {
        sessionID = data.sessionID;

        $('.authed').show();
        $('.unauthed').hide();

        $('#listUnapprovedModules').click();

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
      sessionID = null;
      alert('sessionID: ' + sessionID);
      $('.authed').hide();
      $('.unauthed').show();

      $('#listAllModules').click();
      showDialog('info', 'Successfully logged out.', true);
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
    }, true);
  });

  $('#pagerLeft').click(function(e) {
    e.preventDefault();
    searchPage = validSearchPage(searchPage - 1);
    searchIt(lastSearch, false);
  });

  $('#pagerRight').click(function(e) {
    e.preventDefault();
    searchPage = validSearchPage(searchPage + 1);
    searchIt(lastSearch, false);
  });

  $('#pagerPage').change(function(e) {
    e.preventDefault();
    searchPage = validSearchPage($(this).val() - 1);
    searchIt(lastSearch, false);
  });

  function updatedSort() {
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
    searchIt(updatedSort(), true);
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
    searchIt(updatedSort(), true);
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
    }, true);
  });

  $('#listUnapprovedModules').click(function(e) {
    e.preventDefault();
    searchIt({
      'url' : '/unapproved',
      'title' : 'All unapproved modules',
      'method' : 'post',
      'params' : {
        'sessionID' : sessionID
      }
    }, true);
  });
}

function registering() {
  var additionalURL = $('#registerFormAdditionalURL');
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
        if (!additionalURL.is(':disabled')) {
          params.modURL = additionalURL.val();
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
            $('#registerForm input[name="location"]').get(0).click();
            $('#registerForm input[name="name"]').val('');
            $('#registerForm input[name="modURL"]').val('');
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
    var registerAdditionalLabel = $('#registrationFormAdditional .label');
    if (value === 'mavenCentral') {
      registerAdditionalLabel.text('No additional information needed');

      additionalURL.attr('disabled', 'disabled');
      additionalURL.slideUp();
    } else if (value === 'mavenOther') {
      registerAdditionalLabel.text('Maven prefix URL');

      additionalURL.slideDown({
        'complete' : function() {
          additionalURL.removeAttr('disabled');

          /* this fixes a webkit bug to refresh the disabled attribute correctly */
          additionalURL.hide();
          setTimeout(function() {
            additionalURL.show();
          }, 0);
        }
      });
    } else if (value === 'bintray') {
      registerAdditionalLabel.text('No additional information needed');

      additionalURL.attr('disabled', 'disabled');
      additionalURL.slideUp();
    }
  }

  $('#registerForm input[name="location"]').change(checkAdditionalInfos);
  $('#registerForm input[name="location"]:checked').change();
}

function fillWithLatestAdditions() {
  searchIt({
    'url' : '/list',
    'title' : 'All modules',
    'params' : {
      'by' : 'timeRegistered',
      'desc' : 1
    }
  }, true);
}

function initSearchResultProcessor() {
  return (function() {
    var searchedForText = $('#searchedForText');
    var error = $('#searchResults').find('.error');
    var noResults = $('#searchResults').find('.noResults');
    var placeHolder = $('#searchResults').find('.placeholder');
    var results = $('#results');
    var resultsUl = $('#results ul');
    var resultControls = $('#resultControls');
    var pagerControls = $('#pagerControls');
    var searchResultTemplate = $('#results').find('.template').clone();

    return function(title) {
      return function(data) {
        $('#searchedForText').removeClass('loading');
        placeHolder.hide();
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
              if (isAuthed()) {
                controls.show();
              }
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
                    showDialog('error', 'Could not remove: ' + (reply.message) ? reply.message
                        : reply.messages.join(', '));
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

              function addPartWithLink(key, value) {
                var part = infoPart.clone(false);
                var link = $('<a />');
                link.attr('href', value);
                link.text(value);
                link.click(function(e) {
                  window.open(this.href);
                  return false;
                });
                part.find('.key').text(key);
                part.find('.value').html(link);
                infosUl.append(part);
              }

              tmpl.find('.name').text(module.name);
              tmpl.find('.registered').text(formatTime(module.timeRegistered));
              tmpl.click(function(e) {
                $('#extraInfo-' + module._id).slideToggle();
              });

              addPart('Name', module.name);
              addPart('Description', module.description);
              addPart('Author', module.author);
              addPart('Licenses', module.licenses.join(', '));

              if (module.repoType === 'mavenCentral') {
                addPart('Repository', 'Central Maven Repository');
              } else if (module.repoType === 'mavenOther') {
                addPart('Repository', 'Other Maven Repository');
                addPart('Prefix', module.downloadUrl);
              } else if (module.repoType === 'bintray') {
                addPart('Repository', 'Bintray');
              }

              if (module.homepage) {
                addPartWithLink('Homepage', module.homepage);
              }
              if (module.developers) {
                addPart('Developers', module.developers.sort().join(', '));
              }
              if (module.keywords) {
                addPart('Keywords', module.keywords.sort().join(', '));
              }

              resultsUl.append(tmpl);
            });

            results.show();
          }
        } else {
          error.text('Something unexpected happened! :O');
          error.fadeIn();
        }

        $('#searchResults').slideDown();
      };
    }
  }());
}

function randomizeFooter() {
  var a = [ 'attractive', 'awesome', 'beautiful', 'charismatic', 'colorful', 'cool', 'fabulous',
      'fantastic', 'fine', 'handsome', 'hip', 'funky', 'marvelous', 'nervous', 'nice', 'popular',
      'strong', 'wonderful' ];
  var b = [ 'boys', 'chaps', 'dudes', 'fellows', 'gentlemen', 'gorillas', 'guys', 'hipsters',
      'men', 'pals', 'people', 'rockers', 'strangers' ];
  function randomize(jqElem) {
    var result = a[Math.floor(Math.random() * a.length)] + ' '
        + b[Math.floor(Math.random() * b.length)];
    jqElem.text(result);
  }

  $('#footer .randomName').click(function(e) {
    e.preventDefault();
    randomize($(this));
  });
  $('#footer .randomName').click();
}

function faq() {

  $('#faqLink').click(function(e) {
    e.preventDefault();
    $('#faq').slideToggle();
  });

  $('#faqClose').click(function(e) {
    e.preventDefault();
    $('#faq').slideUp();
  });

  if (document.location.search.substr(1, document.location.search.length) === 'faq') {
    $('#faqLink').click();
  }
}

function init() {
  processSearchResults = initSearchResultProcessor();
  countModules();
  faq();
  authentication();
  searching();
  registering();
  fillWithLatestAdditions();
  dialogs();
  randomizeFooter();
}

$(init);
