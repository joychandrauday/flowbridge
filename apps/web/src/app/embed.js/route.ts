/**
 * Embed loader (SPEC §3): a site pastes
 *   <script src="https://.../embed.js" data-form="FORM_KEY"></script>
 * and this script injects an iframe that renders the form via /embed/:key.
 */

export async function GET() {
  const script = `(function () {
  var script = document.currentScript;
  if (!script) return;
  var key = script.getAttribute('data-form');
  if (!key) {
    console.error('[FlowBridge] embed.js is missing the data-form attribute');
    return;
  }
  var origin = new URL(script.src).origin;
  var height = parseInt(script.getAttribute('data-height') || '560', 10);
  var iframe = document.createElement('iframe');
  iframe.src = origin + '/embed/' + encodeURIComponent(key);
  iframe.setAttribute('title', 'FlowBridge form');
  iframe.setAttribute('loading', 'lazy');
  iframe.style.width = '100%';
  iframe.style.height = height + 'px';
  iframe.style.border = '0';
  iframe.style.borderRadius = '10px';
  script.parentNode.insertBefore(iframe, script.nextSibling);
})();`

  return new Response(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
