function displayPage() {
  const enabled = typeof RTCQuicTransport != "undefined";
  document.getElementById("originTrialDisabled").style.display =
      enabled ? "none" : "block";
  document.getElementById("originTrialEnabled").style.display =
      enabled ? "block" : "none";
}
