# Antigravity

T3 Code runs Google's official Antigravity ACP agent. By default it signs in with your personal
Google account and uses that account's Antigravity access, including access provided by a
Google AI subscription. It never falls back to a different sign-in method than the one you
select.

The agent, files, conversation state, and Google credentials stay on the selected environment.
Your browser or phone controls that environment. Signing in to the Antigravity IDE or CLI does
not sign in this T3 Code provider.

## Set up Antigravity

On web or desktop, open **Settings > Providers**, choose the environment that runs
your project, and enable Antigravity. Install its runtime there, then choose
**Sign in** and complete the browser sign-in. Wait for T3 Code to confirm
account access and load models before starting a thread. Once the runtime is installed,
you can also sign in from **Settings > Provider accounts** in the mobile app.

1. Choose **Enable Antigravity**. Antigravity is off by default.
2. Choose **Install Antigravity**. T3 Code downloads the official runtime from Google to that
   environment. Installation continues if you leave the page or reconnect.
3. Choose **Sign in with Google**.
4. Choose **Open sign-in page** on web or desktop, or **Open Google sign-in** on mobile. You can
   use **Copy sign-in link** to open it in another browser.
5. Complete Google sign-in. Use the account you use for Antigravity.
6. Wait for T3 Code to confirm sign-in and load the model choices. Select an Antigravity model
   in the thread's model picker.

Setup requires a connection with permission to operate the environment. If setup is unavailable
on an older server, update that environment first.

### Sign in from a remote device

Google returns to a `127.0.0.1` address on the device running your browser. If that is the same
machine as the T3 Code environment, sign-in can finish directly.

Copy the full return address, including everything after `?`, into the return URL
field in the client where you started sign-in, then choose
**Continue**. Keep the original address; do not replace it with the server's
hostname. Only that T3 Code sign-in session can finish the attempt. If it expires,
retry sign-in and use the new link.

Return to the same T3 Code client and environment where you started sign-in. Another client
can see that sign-in is in progress, but cannot complete that attempt. The setup screen shows
the expiry time. If it expires, choose **Retry Google sign-in** and use the new link.

The return URL contains a temporary sign-in code. Paste it only into the setup field, not into
a thread or bug report. T3 Code waits for Google's agent to confirm sign-in. A successful
callback page alone does not prove account access.

### Other sign-in methods

**Sign-in method** in the Antigravity provider settings on web or desktop selects how the
agent authenticates. Mobile shows the selected method and its connect controls.

| Method                     | What you enter                           | How it signs in                 |
| -------------------------- | ---------------------------------------- | ------------------------------- |
| Google account             | Nothing                                  | Google sign-in page             |
| Gemini Enterprise          | GCP project and GCP location             | Google sign-in page             |
| Gemini API key             | API key                                  | Choose **Connect**. No browser. |
| Agent Platform (Vertex AI) | API key, or GCP project and GCP location | Choose **Connect**. No browser. |

Gemini Enterprise resolves your license for the project and location you enter. Agent Platform
with a project and location uses Application Default Credentials on the environment. API keys
are stored in plain text in T3 Code settings on that environment and are passed only to the
Antigravity agent process. Ambient `GEMINI_API_KEY` or `GOOGLE_*` variables on the environment
are ignored.

Changing the method stops the instance's sessions. Sign out or disconnect before you switch
accounts.

## Runtime installation

Managed downloads are available for these environment hosts:

| Host    | Architecture  |
| ------- | ------------- |
| macOS   | Apple Silicon |
| Linux   | x64 or ARM64  |
| Windows | x64 or ARM64  |

Google does not publish a local Intel Mac runtime. Use an Intel Mac as a client connected to
a supported remote environment.

Allow several GB of free space, especially on Linux. An update keeps the previous runtime too.
T3 Code does not download it until you choose to install it.

On web or desktop, **Update Antigravity** appears when T3 Code has a newer managed release.
Running sessions keep their current runtime. New sessions use the installed update.

### Use a manual installation

Download the correct archive from the [official ACP Registry][registry] and extract both the
ACP executable and its `localharness_external` helper into the same directory. Keep both files
at the same version and make them executable on macOS or Linux. Windows uses `.exe` files.

On web or desktop, set **Binary path** in the Antigravity provider settings to the ACP
executable on the selected environment. Do not point it at the helper or the Antigravity IDE.

A nonempty **Binary path** takes priority. With the field empty, T3 Code uses its managed
runtime, then an installation on the environment's `PATH`. An invalid explicit path reports
an error instead of selecting another installation. T3 Code does not update or remove manual
installations. Clear **Binary path** to use managed installation controls.

## Models and threads

The current official ACP exposes Gemini models only. T3 Code uses the model IDs and names
returned for your account, including any model choices with different thinking levels. Models
available in other Antigravity apps might not be available through this agent.
The model picker updates when a running session reports new model choices.

New threads use Gemini 3.8 Flash (High) when your account offers it. Older Gemini generations
stay available under **Legacy models** in the picker.

Threads keep their selected model when you resume them. If that model is no longer available,
T3 Code asks you to select an available model instead of silently changing it.

Use Antigravity's native `/plan` command to request a plan. T3 Code's separate Plan mode control
is not available for this provider.

Project skills should use `.agents/skills`. T3 Code also discovers `.gemini/skills` and the legacy
`.agent/skills` location. When multiple locations define the same skill name, `.gemini/skills`
takes precedence, followed by `.agents/skills` and then `.agent/skills`.

Skills for every project go in `~/.gemini/config/skills` or `~/.gemini/antigravity-cli/skills`.
Antigravity does not read `~/.agents/skills` unless the project itself is your home directory.

Antigravity receives images directly. Every other attachment, including PDFs,
text, audio, archives, and videos, is passed as a saved file path for the agent
to inspect with its tools. A video path does not enable native video input.

### Subagents

Subagent launches appear as **Antigravity subagent batch** in **Agents** on web and desktop,
and in the work log on mobile. One launch can start several agents. The batch stays active
after launch while the parent turn runs. When that turn ends, the entry becomes idle and
states that individual agent status is unavailable. Launch errors remain visible.
The conversation summary counts launches as batches and shows idle or stopped batches
without a completion checkmark.

The official ACP agent does not send individual child status, names, models, token usage,
or reply ownership. T3 Code cannot show separate child entries or separate child replies
from the parent conversation. The launch description is not a child result. Batch entries
cannot be opened or controlled as separate threads.

## Accounts and removal

Each Antigravity provider instance has its own Google sign-in on its environment. Use
**Add provider** in web or desktop provider settings to create a separate instance for another
account. To replace an instance's account, sign out first, then sign in again.

| Action                    | Effect                                                            |
| ------------------------- | ----------------------------------------------------------------- |
| Disable                   | Stops the instance's sessions and keeps its Google sign-in.       |
| Sign out                  | Stops the instance's sessions and removes its saved Google login. |
| Remove downloaded runtime | Removes the shared installation and keeps Google credentials.     |

Send `/logout` by itself in an Antigravity thread to sign out that provider instance. This has
the same effect as **Sign out of Google**, including stopping its other sessions.

Before removing a managed runtime, disable the instances that use it and cancel any active
installation. T3 Code refuses removal while the runtime is in use. An explicit **Binary path**
that points into the managed runtime must be cleared first.

## Account access and errors

Google controls account eligibility, models, and usage limits. T3 Code does not report your
paid-plan tier or remaining subscription quota. See Google's [Antigravity plans][plans] and
[personal Google sign-in guide][google-setup].

To check access and reload models, use **Refresh provider status** in web or desktop
provider settings, or **Refresh models** in mobile thread settings. If asked to
sign in again, use provider settings on web or desktop, or **Provider accounts** on mobile.

To check account access and reload models on web or desktop, open **Settings** > **Providers**
and select the circular arrow beside **Checked** at the top of the page. Its tooltip says
**Refresh provider status**. On mobile, use **Refresh models** in the model picker.
Refresh uses saved Google sign-in and does not open a login page. If sign-in is required,
use the provider's setup controls. Automatic status checks verify the installation only.

The packaged runtime can be slow to start, especially on Windows. Health checks, model refresh,
and sign-out each allow up to 90 seconds before reporting a timeout.

If Google reports `SUBSCRIPTION_REQUIRED`, an account restriction, or a usage limit, read the
provider's message. A finished turn can contain an upstream error instead of completed work.
Use any retry time Google supplies. T3 Code does not switch to an API key to get past the limit.

[registry]: https://github.com/agentclientprotocol/registry/blob/main/antigravity-acp/agent.json
[plans]: https://antigravity.google/docs/plans
[google-setup]: https://antigravity.google/docs/ide/extensions/zed
