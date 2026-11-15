// Copy-paste lines for ~/.bashrc / ~/.zshrc on SSH hosts. They emit the same
// OSC 133 markers tdog's own shells do (A prompt, B command, C output,
// D;exit) and append to the user's existing hooks instead of replacing them.

export const SSH_SNIPPET_BASH = `__tdog_pc() { local e=$?; [ -n "$__tdog_ran" ] && printf '\\033]133;D;%s\\033\\\\' "$e"; __tdog_ran=1; printf '\\033]7;file://%s%s\\033\\\\' "$HOSTNAME" "$PWD"; printf '\\033]133;A\\033\\\\'; }
PROMPT_COMMAND="__tdog_pc\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
PS1="$PS1"'\\[\\033]133;B\\033\\\\\\]'
PS0="$PS0"'\\033]133;C\\033\\\\'`;

export const SSH_SNIPPET_ZSH = `__tdog_precmd() { local e=$?; [ -n "$__tdog_ran" ] && printf '\\033]133;D;%s\\033\\\\' "$e"; __tdog_ran=1; printf '\\033]7;file://%s%s\\033\\\\' "$HOST" "$PWD"; printf '\\033]133;A\\033\\\\'; }
__tdog_preexec() { printf '\\033]133;C\\033\\\\'; }
precmd_functions=(__tdog_precmd $precmd_functions)
preexec_functions+=(__tdog_preexec)
PROMPT="$PROMPT%{"$'\\033]133;B\\033\\\\'"%}"`;
