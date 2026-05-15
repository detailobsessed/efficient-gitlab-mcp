/**
 * Category definitions for progressive disclosure.
 *
 * Each category groups related GitLab tools. The LLM discovers categories
 * via list_categories, then activates them via activate_tools.
 */

interface CategoryDef {
  name: string;
  description: string;
}

export const CATEGORIES: CategoryDef[] = [
  {
    name: "repositories",
    description:
      "Search, create, fork repositories. Get file contents, push files, manage branches.",
  },
  {
    name: "merge-requests",
    description: "Create, update, merge MRs. List MRs, get diffs, manage discussions and threads.",
  },
  {
    name: "issues",
    description: "Create, update, delete issues. List issues, manage issue links and discussions.",
  },
  {
    name: "pipelines",
    description: "List, create, retry, cancel pipelines. Get pipeline jobs and their output.",
  },
  {
    name: "projects",
    description: "Get project details, list projects, manage project members and labels.",
  },
  {
    name: "commits",
    description: "List commits, get commit details and diffs.",
  },
  {
    name: "namespaces",
    description: "List, get, and verify namespaces (groups and users).",
  },
  {
    name: "users",
    description:
      "Look up users, search users, list audit/project events, manage file uploads and attachments, and check server health.",
  },
  {
    name: "search",
    description:
      "Global, project, and group search across issues, merge requests, code, commits, and more.",
  },
  {
    name: "wiki",
    description: "List, create, update, delete wiki pages for projects and groups.",
  },
  {
    name: "milestones",
    description:
      "Create, edit, delete milestones. Get milestone issues, merge requests, and burndown events.",
  },
  {
    name: "releases",
    description: "List, create, update, delete releases. Download release assets.",
  },
  {
    name: "webhooks",
    description: "List project webhooks and their recent events.",
  },
  {
    name: "work-items",
    description:
      "Work items via GraphQL: create, update, convert types, manage hierarchy, notes, statuses, custom fields, and incident timeline events.",
  },
  {
    name: "graphql",
    description: "Execute arbitrary GraphQL queries against the GitLab API.",
  },
  {
    name: "emoji-reactions",
    description:
      "Add, remove, and list emoji reactions on merge requests, issues, work items, and their notes. REST for MRs / issues, GraphQL for work items.",
  },
];
