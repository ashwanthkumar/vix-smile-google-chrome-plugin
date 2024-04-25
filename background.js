chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({
    url: 'ivsmile.html'
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // console.log(msg)
  switch (msg.type) {
    case "fetch":
      // console.log("fetching " + msg.url);
      fetch(msg.url, msg.options || undefined).then((r) => {
        // r.json().then((json) => console.log(json))
        // console.log(r)
        if (r.status == 200) {
          r.json().then((data) => {
            sendResponse({success: true, data: data})
          })
        } else {
          console.error(r);
          sendResponse({success: false, status: r.status, error: r.statusText});
        }
      })
      break;
    
    default:
      break;
  }

  return true;
});
