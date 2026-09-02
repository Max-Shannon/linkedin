function interpretRemoveResponse(response) {
  const status = response?.status ?? null;
  const body = String(response?.body || '');
  const ok = Boolean(response?.ok);

  if (/Connection removed/i.test(body)) {
    return { outcome: 'removed', status, alreadyDisconnected: false };
  }

  if (
    /already disconnected|no longer connected|not (currently )?connected|isn't connected|is not a connection|does not exist as a connection|not a 1st degree/i.test(
      body
    )
  ) {
    return { outcome: 'already_disconnected', status, alreadyDisconnected: true };
  }

  if (ok && /ToastPresetCategory_SUCCESS/i.test(body)) {
    return { outcome: 'removed', status, alreadyDisconnected: false };
  }

  if (ok) {
    return { outcome: 'removed', status, alreadyDisconnected: false };
  }

  return { outcome: 'failed', status, alreadyDisconnected: false };
}

function isTrackedRemoved(removeState, vanityName) {
  if (!removeState?.removed || !vanityName) {
    return false;
  }
  if (removeState.removed[vanityName]) {
    return true;
  }
  const key = String(vanityName).toLowerCase();
  return Object.keys(removeState.removed).some((name) => name.toLowerCase() === key);
}

module.exports = {
  interpretRemoveResponse,
  isTrackedRemoved,
};
