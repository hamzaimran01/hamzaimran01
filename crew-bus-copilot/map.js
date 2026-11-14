/* Drawn, schematic map of the Frankfurt Airport apron. Positions are approximate and not to scale. */
var FraMap = (function () {
  var NODES = {
    'Crew Center': { x: 486, y: 160, sub: 'crew briefing' },
    'Pier A':      { x: 352, y: 252, sub: 'Schengen' },
    'Pier Z':      { x: 262, y: 252, sub: 'non-Schengen, above A' },
    'Pier B':      { x: 470, y: 336, sub: 'Concourse B' },
    'Apron V':     { x: 214, y: 382, sub: 'remote stands' },
    'Apron F':     { x: 738, y: 368, sub: 'remote stands' },
    'Bus Depot':   { x: 846, y: 276, sub: 'bus base' }
  };
  var LABEL_OFF = { 'Crew Center': [-16, -14], 'Pier A': [8, -30], 'Pier Z': [-8, -30], 'Pier B': [-16, 26], 'Apron V': [14, 18], 'Apron F': [14, 18], 'Bus Depot': [0, -44] };

  function node(name) { var n = NODES[name]; return n ? { x: n.x, y: n.y } : { x: 500, y: 300 }; }
  function ctrl(a, b) {
    var p0 = node(a < b ? a : b), p1 = node(a < b ? b : a);
    var mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2, dx = p1.x - p0.x, dy = p1.y - p0.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1, k = 0.14 * len;
    return { x: mx - dy / len * k, y: my + dx / len * k };
  }
  function along(a, b, p) {
    p = Math.max(0, Math.min(1, p));
    var p0 = node(a), p1 = node(b), c = ctrl(a, b), q = 1 - p;
    return { x: q * q * p0.x + 2 * q * p * c.x + p * p * p1.x, y: q * q * p0.y + 2 * q * p * c.y + p * p * p1.y };
  }
  function pathD(a, b) { var p0 = node(a), p1 = node(b), c = ctrl(a, b); return 'M' + p0.x + ' ' + p0.y + ' Q' + c.x.toFixed(1) + ' ' + c.y.toFixed(1) + ' ' + p1.x + ' ' + p1.y; }

  function runway(x1, y1, x2, y2, l1, l2) {
    var a = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    return '<line class="m-rwy" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>' +
      '<line class="m-rwy-c" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>' +
      '<text class="m-rwy-t" transform="translate(' + (x1 + 14) + ' ' + (y1 + 4) + ') rotate(' + a.toFixed(1) + ')">' + l1 + '</text>' +
      '<text class="m-rwy-t" text-anchor="end" transform="translate(' + (x2 - 14) + ' ' + (y2 + 4) + ') rotate(' + a.toFixed(1) + ')">' + l2 + '</text>';
  }

  function staticSvg(buses) {
    var names = Object.keys(NODES), roads = '';
    for (var i = 0; i < names.length; i++) for (var j = i + 1; j < names.length; j++) roads += '<path class="m-road" d="' + pathD(names[i], names[j]) + '"/>';
    var nodes = names.map(function (n) {
      var p = NODES[n], o = LABEL_OFF[n], anc = o[0] < 0 ? ' text-anchor="end"' : o[0] === 0 ? ' text-anchor="middle"' : '';
      return '<g class="m-node" data-select="loc:' + n + '"><circle class="m-node-halo" cx="' + p.x + '" cy="' + p.y + '" r="15"/><circle class="m-node-dot" cx="' + p.x + '" cy="' + p.y + '" r="6"/>' +
        '<g class="m-lbl"><text class="m-node-t" x="' + (p.x + o[0]) + '" y="' + (p.y + o[1]) + '"' + anc + '>' + n + '</text>' +
        '<text class="m-node-s" x="' + (p.x + o[0]) + '" y="' + (p.y + o[1] + 13) + '"' + anc + '>' + p.sub + '</text></g></g>';
    }).join('');
    var busEls = buses.map(function (b) {
      return '<g class="m-bus m-k-idle" id="mb-' + b + '" data-select="bus:' + b + '" role="button" tabindex="0" aria-label="Bus ' + b + '">' +
        '<circle class="m-bus-pulse" r="12"/><circle class="m-bus-sel" r="17"/><circle class="m-bus-dot" r="12"/>' +
        '<text class="m-bus-num" y="4">' + b.slice(1) + '</text>' +
        '<g class="m-bus-tag m-lbl"><rect x="16" y="-10" rx="6" height="20" width="40"/><text x="23" y="4"></text></g></g>';
    }).join('');
    return '<svg class="fra-map" viewBox="0 0 1000 600" role="img" aria-label="Schematic map of Frankfurt Airport with crew buses">' +
      '<rect class="m-ground" x="0" y="0" width="1000" height="600" rx="0"/>' +
      '<g class="m-airport">' +
        '<path class="m-grass" d="M0 430 L1000 360 L1000 600 L0 600 Z"/>' +
        '<path class="m-grass" d="M0 0 L470 0 L430 120 L0 160 Z"/>' +
        '<rect class="m-apron" x="160" y="215" width="400" height="190" rx="18"/>' +
        '<rect class="m-apron" x="600" y="200" width="300" height="200" rx="18"/>' +
        runway(40, 132, 450, 88, '07L', '25R') +
        runway(70, 488, 950, 412, '07C', '25C') +
        runway(110, 556, 980, 481, '07R', '25L') +
        '<line class="m-rwy" x1="40" y1="190" x2="52" y2="470"/><line class="m-rwy-c" x1="40" y1="190" x2="52" y2="470"/>' +
        '<text class="m-rwy-t" x="62" y="210">18</text>' +
        '<g class="m-bldg">' +
          '<rect x="410" y="180" width="160" height="46" rx="8"/>' +
          '<rect x="232" y="240" width="200" height="24" rx="8"/>' +
          '<rect x="452" y="226" width="34" height="96" rx="8"/>' +
          '<rect x="520" y="226" width="96" height="22" rx="8"/>' +
          '<rect x="640" y="190" width="120" height="40" rx="8"/>' +
          '<rect x="670" y="230" width="22" height="70" rx="6"/><rect x="718" y="230" width="22" height="70" rx="6"/>' +
          '<rect x="452" y="140" width="64" height="30" rx="6"/>' +
          '<rect x="824" y="262" width="56" height="30" rx="6"/>' +
        '</g>' +
        '<g class="m-area-t m-lbl">' +
          '<text x="500" y="218">Terminal 1</text><text x="650" y="215">Terminal 2</text>' +
          '<text x="240" y="282">Concourse A / Z</text><text x="494" y="310">B</text><text x="580" y="270">C</text>' +
          '<text x="680" y="318">D</text><text x="728" y="318">E</text>' +
          '<text x="520" y="580">Cargo City South</text>' +
        '</g>' +
      '</g>' +
      '<g class="m-roads">' + roads + '</g>' +
      '<g id="mRoutes" class="m-routes"></g>' +
      '<g class="m-nodes">' + nodes + '</g>' +
      '<g id="mPins" class="m-pins"></g>' +
      '<g id="mBuses">' + busEls + '</g>' +
      '<g class="m-compass" transform="translate(955 44)"><circle r="16"/><path d="M0 -10 L5 4 L0 1 L-5 4 Z"/><text y="-20" text-anchor="middle">N</text></g>' +
      '</svg>';
  }

  return { NODES: NODES, node: node, along: along, pathD: pathD, staticSvg: staticSvg };
})();
