function applyPdvProductIdentity(app, pathModule) {
  app.setName("PDV Nexus Clássico Azul");
  app.setPath("userData", pathModule.join(app.getPath("appData"), "PDV Nexus Classico Azul"));
}

module.exports = { applyPdvProductIdentity };
