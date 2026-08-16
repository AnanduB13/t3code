# Skills

Skills give an agent reusable instructions for specialized tasks. The available skills depend on
the selected provider and project.

Type `/skills` in the composer and press Enter to open the skills panel. Each entry shows the
skill name, description, and scope. Choose **Use** to add a skill to the current prompt.

## Create a project skill

Open `/skills`, choose **Add new skill**, and provide:

- A short name. T3 Code converts it to lowercase hyphenated form.
- A description explaining what the skill does and when it should be used.
- The instructions the agent should follow.

New skills are saved in the current project and become available immediately. Skill creation is
supported for Codex and Claude. T3 Code refuses to overwrite an existing skill with the same name.

## Manage global skills in Settings

Open **Settings → Skills** to browse the skills available on each connected device and provider
instance. Select a skill to inspect its `SKILL.md` file.

User-owned global skills can be edited and saved directly. Built-in, plugin-managed, and project
skills remain visible but read-only so their owning installation or repository stays authoritative.
Use **New global skill** to add a skill to the selected Codex or Claude instance's global skills
directory.
