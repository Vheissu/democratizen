(function () {
  'use strict';

  var screen = document.querySelector('.screen');
  var clock = document.getElementById('clock');
  var date = document.getElementById('date');
  var status = document.getElementById('status');

  function updateTime() {
    var now = new Date();
    clock.textContent = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
    date.textContent = now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  document.addEventListener('keydown', function (event) {
    if (event.keyCode === 13) {
      screen.classList.toggle('alt');
      status.textContent = screen.classList.contains('alt') ? 'Colour changed' : 'Tizen app test';
    } else if (event.keyCode === 10009 || event.keyCode === 27) {
      if (window.tizen && tizen.application) tizen.application.getCurrentApplication().exit();
    }
  });

  updateTime();
  setInterval(updateTime, 15000);
}());
