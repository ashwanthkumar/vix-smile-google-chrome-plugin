const ctx = document.getElementById('smile');

let existingChart = new Chart(ctx, {
  type: 'line',
  data: {},
});

async function fetch2(url, options) {
  const response = await chrome.runtime.sendMessage({ type: "fetch", "url": url, options: options || undefined });
  if (!response.success) {
    throw new Error(response.status + " with " + response.error);
  }
  return response.data;
}

async function init() {

  const userDetails = await fetch2("https://api.sensibull.com/v1/users/me");
  const brokerId = userDetails.data.broker_details.broker_id;

  // 2 is the default backend for free user or user with no access token / cookie
  const instrument_metacache = await fetch2(`https://oxide.sensibull.com/v1/compute/cache/instrument_metacache/${brokerId}`);
  // console.log(instrument_metacache);
  // console.log(instrument_metacache.derivatives);
  function extractInstrument(value) {
    // console.log("inside extractInstrument = ", value)
    if (Array.isArray(value)) {
      return _.flattenDeep(
        value.flatMap((element) => {
          return extractInstrument(element);
        })
      );
    } else if (_.has(value, 'derivatives')) {
      return extractInstrument(_.values(value.derivatives));
    } else if (_.has(value, 'options')) {
      return _.concat(
        extractInstrument(_.values(value.options)),
        value.FUT
      );
    } else {
      return value.FUT || value.CE || value.PE || value;
    }
  }

  const nseUnderlying = _.values(instrument_metacache.underlyer_list.NSE["NSE"].EQ).filter((r) => !r.is_non_fno);
  const nseIndicesUnderlying = _.values(instrument_metacache.underlyer_list.NSE["NSE-INDICES"].EQ);
  const bseIndicesUnderlying = _.values(instrument_metacache.underlyer_list.BSE["BSE-INDICES"].EQ);
  const cdsIndicesUnderlying = _.values(instrument_metacache.underlyer_list.CDS["CDS-INDICES"].INDEX);
  const instrumentsList = _.union(nseIndicesUnderlying, bseIndicesUnderlying, cdsIndicesUnderlying, nseUnderlying);

  const allTokensToInstruments = _.union(nseIndicesUnderlying, bseIndicesUnderlying, cdsIndicesUnderlying, nseUnderlying)
    .reduce((prev, instrument) => {
      Object.assign(prev, {
        [instrument.instrument_token]: instrument.tradingsymbol
      });
      return prev;
    }, {});
  // console.log(allTokensToInstruments);
  _.sortBy(instrumentsList, 'tradingsymbol').forEach(i => {
    $('#instruments').append($('<option>', {
      value: i.instrument_token,
      text: i.tradingsymbol,
    }));
  });

  $('#instruments').on('change', async function () {
    console.log("Instrument Changed")
    const instrumentToken = this.value;
    const pricesAcrossExpiry = await fetch2(`https://oxide.sensibull.com/v1/compute/cache/live_derivative_prices/${instrumentToken}`)
    const data = pricesAcrossExpiry.data.per_expiry_data;
    const expiries = _.keys(data).sort();
    $('#expiries option').remove();

    expiries.forEach(expiry => {
      $('#expiries').append($('<option>', {
        value: `${expiry}`,
        text: expiry,
      }));
    });

    $("#expiries").val(expiries[0]).change();
  });

  $('#expiries').on('change', async function () {
    console.log('expiry changed');
    const instrumentToken = $("#instruments").val();
    const pricesAcrossExpiry = await fetch2(`https://oxide.sensibull.com/v1/compute/cache/live_derivative_prices/${instrumentToken}`)
    const data = pricesAcrossExpiry.data.per_expiry_data;

    const underlying = allTokensToInstruments[instrumentToken];
    const instrumentTokens = await fetch2(`https://oxide.sensibull.com/v1/compute/cache/instrument_metacache_addon/${brokerId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ underlyer_list: [underlying] })
    });
    const derivativeInstruments = JSON.parse(instrumentTokens.payload.derivatives[underlying]);
    const underlyingDerivatives = _.compact(extractInstrument(_.values(derivativeInstruments.derivatives)))
      .reduce((prev, instrument) => {
        Object.assign(prev, {
          [instrument.instrument_token]: instrument.tradingsymbol
        });
        return prev;
      }, {});

    const expiry = this.value;
    const expiryData = data[expiry];

    const requiredOptions = _.sortBy(
      expiryData.options
        .filter((o) => o.greeks_with_iv != null)
        .map((o) => Object.assign(o, { label: underlyingDerivatives[o.token] }))
      , 'label'
    );
    const chartData = {
      datasets: [
        {
          label: `${allTokensToInstruments[instrumentToken]}/${expiry}`,
          data: requiredOptions.map((o) => {
            return {
              x: o.label,
              y: o.greeks_with_iv.iv * 100
            };
          })
        }
      ],
    };

    existingChart.destroy();
    existingChart = new Chart(ctx, {
      type: 'line',
      data: chartData,
    });
    existingChart.update()
  });

}

init();

