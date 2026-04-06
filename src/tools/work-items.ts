import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defaultClient, encodeProjectId } from "../utils/gitlab-client.js";
import type { Logger } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Shared types & constants
// ---------------------------------------------------------------------------

const workItemTypeEnum = z
  .string()
  .transform((v) => v.toLowerCase())
  .pipe(
    z.enum([
      "issue",
      "task",
      "incident",
      "test_case",
      "epic",
      "key_result",
      "objective",
      "requirement",
      "ticket",
    ]),
  );

const WORK_ITEM_TYPE_NAMES: Record<string, string> = {
  issue: "Issue",
  task: "Task",
  incident: "Incident",
  test_case: "Test Case",
  epic: "Epic",
  key_result: "Key Result",
  objective: "Objective",
  requirement: "Requirement",
  ticket: "Ticket",
};

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const WorkItemParamsSchema = z.object({
  project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
  iid: z.coerce.number().describe("The internal ID (IID) of the work item"),
});

const GetWorkItemSchema = WorkItemParamsSchema;

const ListWorkItemsSchema = z.object({
  project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
  types: z
    .array(workItemTypeEnum)
    .optional()
    .describe("Filter by work item types. If not set, returns all types."),
  state: z.enum(["opened", "closed"]).optional().describe("Filter by state"),
  search: z.string().optional().describe("Search in title and description"),
  assignee_usernames: z.array(z.string()).optional().describe("Filter by assignee usernames"),
  label_names: z.array(z.string()).optional().describe("Filter by label names"),
  first: z.coerce
    .number()
    .optional()
    .default(20)
    .describe("Number of items to return (max 100). Default 20."),
  after: z
    .string()
    .optional()
    .describe("Cursor for pagination (from previous response's endCursor)"),
});

const CreateWorkItemSchema = z.object({
  project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
  title: z.string().describe("Title of the work item"),
  type: workItemTypeEnum
    .optional()
    .default("issue")
    .describe("Type of work item to create. Defaults to 'issue'."),
  description: z.string().optional().describe("Description of the work item (Markdown supported)"),
  labels: z.array(z.string()).optional().describe("Array of label names to assign"),
  assignee_usernames: z.array(z.string()).optional().describe("Array of usernames to assign"),
  parent_iid: z.coerce.number().optional().describe("IID of the parent work item to set hierarchy"),
  weight: z.coerce.number().optional().describe("Weight of the work item"),
  health_status: z
    .enum(["onTrack", "needsAttention", "atRisk"])
    .optional()
    .describe("Set health status"),
  start_date: z.string().optional().describe("Start date in YYYY-MM-DD format"),
  due_date: z.string().optional().describe("Due date in YYYY-MM-DD format"),
  milestone_id: z
    .string()
    .optional()
    .describe(
      "Milestone ID (GitLab global ID format, e.g. 'gid://gitlab/Milestone/123', or numeric ID)",
    ),
  iteration_id: z
    .string()
    .optional()
    .describe(
      "Iteration ID (e.g. 'gid://gitlab/Iteration/123' or numeric ID). Use list_group_iterations to find available iterations.",
    ),
  confidential: z.coerce.boolean().optional().describe("Set confidentiality"),
});

const UpdateWorkItemSchema = WorkItemParamsSchema.extend({
  title: z.string().optional().describe("New title"),
  description: z.string().optional().describe("New description (Markdown supported)"),
  add_labels: z.array(z.string()).optional().describe("Label names to add"),
  remove_labels: z.array(z.string()).optional().describe("Label names to remove"),
  assignee_usernames: z
    .array(z.string())
    .optional()
    .describe("Set assignees by username (replaces existing)"),
  state_event: z.enum(["close", "reopen"]).optional().describe("Close or reopen the work item"),
  weight: z.coerce.number().optional().describe("Set weight (issues, tasks, epics only)"),
  status: z
    .string()
    .optional()
    .describe("Set status by ID. Use list_work_item_statuses to get available status IDs."),
  parent_iid: z.coerce
    .number()
    .optional()
    .describe(
      "Set parent work item by IID. Use with parent_project_id if parent is in a different project.",
    ),
  parent_project_id: z.coerce
    .string()
    .optional()
    .describe(
      "Project ID or path of the parent work item (defaults to same project as the work item)",
    ),
  remove_parent: z.coerce
    .boolean()
    .optional()
    .describe("Set to true to remove the parent from hierarchy"),
  children_to_add: z
    .array(
      z.object({
        project_id: z.coerce.string().describe("Project ID or path of the child work item"),
        iid: z.coerce.number().describe("IID of the child work item"),
      }),
    )
    .optional()
    .describe("Array of children to add to this work item's hierarchy"),
  children_to_remove: z
    .array(
      z.object({
        project_id: z.coerce.string().describe("Project ID or path of the child work item"),
        iid: z.coerce.number().describe("IID of the child work item"),
      }),
    )
    .optional()
    .describe("Array of children to remove from this work item's hierarchy"),
  health_status: z
    .enum(["onTrack", "needsAttention", "atRisk"])
    .optional()
    .describe("Set health status on issues and epics"),
  start_date: z.string().optional().describe("Start date in YYYY-MM-DD format"),
  due_date: z.string().optional().describe("Due date in YYYY-MM-DD format"),
  milestone_id: z
    .string()
    .optional()
    .describe(
      "Milestone ID (GitLab global ID format, e.g. 'gid://gitlab/Milestone/123', or numeric ID)",
    ),
  iteration_id: z
    .string()
    .optional()
    .describe(
      "Iteration ID (e.g. 'gid://gitlab/Iteration/123' or numeric ID). Use list_group_iterations to find available iterations.",
    ),
  confidential: z.coerce.boolean().optional().describe("Set confidentiality"),
  linked_items_to_add: z
    .array(
      z.object({
        project_id: z.coerce.string().describe("Project ID or path of the work item to link"),
        iid: z.coerce.number().describe("IID of the work item to link"),
        link_type: z
          .enum(["RELATED", "BLOCKED_BY", "BLOCKS"])
          .optional()
          .default("RELATED")
          .describe("Link type: RELATED, BLOCKED_BY, or BLOCKS. Defaults to RELATED."),
      }),
    )
    .optional()
    .describe("Work items to link"),
  linked_items_to_remove: z
    .array(
      z.object({
        project_id: z.coerce
          .string()
          .describe("Project ID or path of the linked work item to remove"),
        iid: z.coerce.number().describe("IID of the linked work item to remove"),
      }),
    )
    .optional()
    .describe("Linked work items to remove"),
  custom_fields: z
    .array(
      z.object({
        custom_field_id: z
          .string()
          .describe("Custom field ID (e.g. 'gid://gitlab/IssuablesCustomField/123' or numeric ID)"),
        text_value: z.string().optional().describe("Text value (for text fields)"),
        number_value: z.coerce.number().optional().describe("Number value (for number fields)"),
        selected_option_ids: z
          .array(z.string())
          .optional()
          .describe("Selected option IDs (for select fields)"),
        date_value: z
          .string()
          .optional()
          .describe("Date value in YYYY-MM-DD format (for date fields)"),
      }),
    )
    .optional()
    .describe("Custom field values to set"),
  severity: z
    .enum(["UNKNOWN", "LOW", "MEDIUM", "HIGH", "CRITICAL"])
    .optional()
    .describe("Incident only: set severity level"),
  escalation_status: z
    .enum(["TRIGGERED", "ACKNOWLEDGED", "RESOLVED", "IGNORED"])
    .optional()
    .describe("Incident only: set escalation status"),
});

const ConvertWorkItemTypeSchema = z.object({
  project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
  iid: z.coerce.number().describe("The internal ID of the work item"),
  new_type: workItemTypeEnum.describe("The target work item type to convert to"),
});

const ListWorkItemStatusesSchema = z.object({
  project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
  work_item_type: workItemTypeEnum
    .optional()
    .default("issue")
    .describe("The work item type to list available statuses for. Defaults to 'issue'."),
});

const ListWorkItemNotesSchema = z.object({
  project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
  iid: z.coerce.number().describe("The internal ID of the work item"),
  page_size: z.coerce
    .number()
    .optional()
    .default(20)
    .describe("Number of discussions to return (default 20)"),
  after: z.string().optional().describe("Cursor for pagination"),
  sort: z
    .enum(["CREATED_ASC", "CREATED_DESC"])
    .optional()
    .default("CREATED_ASC")
    .describe("Sort order for discussions"),
});

const CreateWorkItemNoteSchema = z.object({
  project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
  iid: z.coerce.number().describe("The internal ID of the work item"),
  body: z.string().describe("Note body (Markdown supported)"),
  internal: z.coerce
    .boolean()
    .optional()
    .default(false)
    .describe("Create as internal/confidential note (only visible to project members)"),
  discussion_id: z
    .string()
    .optional()
    .describe(
      "Discussion ID to reply to (for threaded replies). If omitted, creates a new top-level note.",
    ),
});

const MoveWorkItemSchema = z.object({
  project_id: z.coerce.string().describe("Project ID or URL-encoded path of the source project"),
  iid: z.coerce.number().describe("The internal ID of the work item to move"),
  target_project_id: z.coerce
    .string()
    .describe("Project ID or URL-encoded path of the target project"),
});

const ListCustomFieldDefinitionsSchema = z.object({
  project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
  work_item_type: workItemTypeEnum
    .optional()
    .default("issue")
    .describe("The work item type to list custom field definitions for. Defaults to 'issue'."),
});

const GetTimelineEventsSchema = z.object({
  project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
  incident_iid: z.coerce.number().describe("The internal ID (IID) of the incident"),
});

const CreateTimelineEventSchema = z.object({
  project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
  incident_iid: z.coerce.number().describe("The internal ID (IID) of the incident"),
  note: z.string().describe("Description of the timeline event (Markdown supported)"),
  occurred_at: z
    .string()
    .describe("When the event occurred in ISO 8601 format (e.g. '2026-03-15T09:00:00.000Z')"),
  tag_names: z
    .array(
      z.enum([
        "Start time",
        "End time",
        "Impact detected",
        "Response initiated",
        "Impact mitigated",
        "Cause identified",
      ]),
    )
    .optional()
    .describe(
      "Timeline event tags to attach. Available: 'Start time', 'End time', 'Impact detected', 'Response initiated', 'Impact mitigated', 'Cause identified'.",
    ),
});

// ---------------------------------------------------------------------------
// Helper: resolve project path via REST
// ---------------------------------------------------------------------------

async function resolveProjectPath(projectId: string): Promise<string> {
  const project = await defaultClient.get<{ path_with_namespace: string }>(
    `/projects/${encodeProjectId(projectId)}`,
  );
  return project.path_with_namespace;
}

// ---------------------------------------------------------------------------
// Helper: resolve work item GID
// ---------------------------------------------------------------------------

async function resolveWorkItemGID(
  projectId: string,
  issueIid: number,
): Promise<{ workItemGID: string; projectPath: string }> {
  const projectPath = await resolveProjectPath(projectId);

  const data = await defaultClient.graphql<{
    namespace: { workItem: { id: string } | null };
  }>(
    `query($path: ID!, $iid: String!) {
      namespace(fullPath: $path) {
        workItem(iid: $iid) { id }
      }
    }`,
    { path: projectPath, iid: String(issueIid) },
  );

  if (!data.namespace?.workItem?.id) {
    throw new Error(`Work item #${issueIid} not found in project ${projectPath}`);
  }

  return { workItemGID: data.namespace.workItem.id, projectPath };
}

// ---------------------------------------------------------------------------
// Helper: resolve label names & usernames to GIDs
// ---------------------------------------------------------------------------

async function resolveNamesToIds(
  projectPath: string,
  labelNames?: string[],
  usernames?: string[],
): Promise<{ labelIds: string[]; userIds: string[] }> {
  if (!labelNames?.length && !usernames?.length) {
    return { labelIds: [], userIds: [] };
  }
  const data = await defaultClient.graphql<{
    project: { labels: { nodes: Array<{ id: string; title: string }> } };
    users: { nodes: Array<{ id: string; username: string }> };
  }>(
    `query($path: ID!, $usernames: [String!]!) {
      project(fullPath: $path) { labels(includeAncestorGroups: true, first: 250) { nodes { id title } } }
      users(usernames: $usernames) { nodes { id username } }
    }`,
    { path: projectPath, usernames: usernames || [] },
  );
  const labelIds = (labelNames || []).map((name) => {
    const label = data.project.labels.nodes.find((l) => l.title === name);
    if (!label) throw new Error(`Label '${name}' not found in project`);
    return label.id;
  });
  const userIds = (usernames || []).map((name) => {
    const user = data.users.nodes.find((u) => u.username === name);
    if (!user) throw new Error(`User '${name}' not found`);
    return user.id;
  });
  return { labelIds, userIds };
}

// ---------------------------------------------------------------------------
// Helper: resolve work item type GID
// ---------------------------------------------------------------------------

async function resolveWorkItemTypeGID(projectPath: string, typeName: string): Promise<string> {
  const targetName = WORK_ITEM_TYPE_NAMES[typeName];
  if (!targetName) throw new Error(`Unknown work item type: ${typeName}`);

  const data = await defaultClient.graphql<{
    namespace: { workItemTypes: { nodes: Array<{ id: string; name: string }> } };
  }>(
    `query($path: ID!) {
      namespace(fullPath: $path) {
        workItemTypes { nodes { id name } }
      }
    }`,
    { path: projectPath },
  );

  const typeNode = data.namespace?.workItemTypes?.nodes?.find((n) => n.name === targetName);
  if (!typeNode) {
    throw new Error(`Work item type '${targetName}' not found in project ${projectPath}`);
  }
  return typeNode.id;
}

// ---------------------------------------------------------------------------
// Helper: incident severity & escalation
// ---------------------------------------------------------------------------

async function updateIncidentSeverity(
  projectPath: string,
  incidentIid: number,
  severity: string,
): Promise<void> {
  const data = await defaultClient.graphql<{
    issueSetSeverity: { errors: string[] };
  }>(
    `mutation($projectPath: ID!, $severity: IssuableSeverity!, $iid: String!) {
      issueSetSeverity(input: { iid: $iid, severity: $severity, projectPath: $projectPath }) {
        errors
      }
    }`,
    { projectPath, severity, iid: String(incidentIid) },
  );
  if (data.issueSetSeverity.errors?.length > 0) {
    throw new Error(`Failed to set severity: ${data.issueSetSeverity.errors.join(", ")}`);
  }
}

async function updateIncidentEscalationStatus(
  projectPath: string,
  incidentIid: number,
  status: string,
): Promise<void> {
  const data = await defaultClient.graphql<{
    issueSetEscalationStatus: { errors: string[] };
  }>(
    `mutation($projectPath: ID!, $status: IssueEscalationStatus!, $iid: String!) {
      issueSetEscalationStatus(input: { projectPath: $projectPath, status: $status, iid: $iid }) {
        errors
      }
    }`,
    { projectPath, status, iid: String(incidentIid) },
  );
  if (data.issueSetEscalationStatus.errors?.length > 0) {
    throw new Error(
      `Failed to set escalation status: ${data.issueSetEscalationStatus.errors.join(", ")}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Helper: remove parent from a work item
// ---------------------------------------------------------------------------

async function removeIssueParent(projectId: string, issueIid: number): Promise<void> {
  const { workItemGID } = await resolveWorkItemGID(projectId, issueIid);
  const data = await defaultClient.graphql<{
    workItemUpdate: { errors: string[] };
  }>(
    `mutation($id: WorkItemID!) {
      workItemUpdate(input: { id: $id, hierarchyWidget: { parentId: null } }) {
        workItem { id }
        errors
      }
    }`,
    { id: workItemGID },
  );
  if (data.workItemUpdate.errors?.length > 0) {
    throw new Error(`Failed to remove parent: ${data.workItemUpdate.errors.join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// Shared mutation-building types & helpers
// ---------------------------------------------------------------------------

interface MutationBuilder {
  varDefs: string[];
  inputParts: string[];
  variables: Record<string, unknown>;
}

function toGID(id: string, type: string): string {
  return id.startsWith("gid://") ? id : `gid://gitlab/${type}/${id}`;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

async function getWorkItem(projectId: string, iid: number): Promise<Record<string, unknown>> {
  const projectPath = await resolveProjectPath(projectId);

  const data = await defaultClient.graphql<{ namespace: { workItem: Record<string, unknown> } }>(
    `query($path: ID!, $iid: String!) {
      namespace(fullPath: $path) {
        workItem(iid: $iid) {
          id iid title state description webUrl confidential
          author { username }
          createdAt closedAt
          workItemType { name }
          widgets {
            __typename
            ... on WorkItemWidgetHierarchy {
              hasChildren hasParent
              parent { id iid title webUrl workItemType { name } namespace { fullPath } }
              children { nodes { id iid title state webUrl workItemType { name } namespace { fullPath } } }
            }
            ... on WorkItemWidgetStatus { status { id name category color iconName position } }
            ... on WorkItemWidgetCustomFields {
              customFieldValues {
                __typename
                customField { id name fieldType }
                ... on WorkItemNumberFieldValue { value }
                ... on WorkItemTextFieldValue { value }
                ... on WorkItemSelectFieldValue { selectedOptions { id value } }
              }
            }
            ... on WorkItemWidgetLabels { labels { nodes { id title color } } }
            ... on WorkItemWidgetAssignees { assignees { nodes { id username name } } }
            ... on WorkItemWidgetWeight { weight rolledUpWeight rolledUpCompletedWeight }
            ... on WorkItemWidgetHealthStatus { healthStatus }
            ... on WorkItemWidgetStartAndDueDate { startDate dueDate }
            ... on WorkItemWidgetMilestone { milestone { id title } }
            ... on WorkItemWidgetLinkedItems {
              blocked blockedByCount blockingCount
              linkedItems { nodes { linkType workItem { id iid title state webUrl workItemType { name } namespace { fullPath } } } }
            }
            ... on WorkItemWidgetTimeTracking { timeEstimate totalTimeSpent }
            ... on WorkItemWidgetDevelopment {
              willAutoCloseByMergeRequest
              relatedBranches { nodes { name } }
              relatedMergeRequests { nodes { iid title webUrl state sourceBranch } }
              closingMergeRequests { nodes { mergeRequest { iid title webUrl state sourceBranch } } }
              featureFlags { nodes { name active } }
            }
            ... on WorkItemWidgetIteration {
              iteration { id title startDate dueDate webUrl iterationCadence { id title } }
            }
            ... on WorkItemWidgetProgress { progress }
            ... on WorkItemWidgetColor { color textColor }
          }
        }
      }
    }`,
    { path: projectPath, iid: String(iid) },
  );

  if (!data.namespace?.workItem) {
    throw new Error(`Work item #${iid} not found in project ${projectPath}`);
  }

  return flattenWorkItem(data.namespace.workItem as WorkItemRaw);
}

// biome-ignore lint/suspicious/noExplicitAny: GraphQL widget types are dynamic
type WorkItemRaw = Record<string, any>;

function findWidget(widgets: WorkItemRaw[], typeName: string): WorkItemRaw | undefined {
  return widgets.find((w) => w.__typename === typeName);
}

function extractCoreWidgets(widgets: WorkItemRaw[], result: Record<string, unknown>): void {
  const statusW = findWidget(widgets, "WorkItemWidgetStatus");
  if (statusW?.status)
    result.status = {
      name: statusW.status.name,
      id: statusW.status.id,
      category: statusW.status.category,
    };

  const labelsW = findWidget(widgets, "WorkItemWidgetLabels");
  const labels = (labelsW?.labels?.nodes || []).map((l: WorkItemRaw) => l.title);
  if (labels.length > 0) result.labels = labels;

  const assigneesW = findWidget(widgets, "WorkItemWidgetAssignees");
  const assignees = (assigneesW?.assignees?.nodes || []).map((a: WorkItemRaw) => a.username);
  if (assignees.length > 0) result.assignees = assignees;

  const weightW = findWidget(widgets, "WorkItemWidgetWeight");
  if (weightW?.weight != null) {
    result.weight = weightW.weight;
    if (weightW.rolledUpWeight != null) result.rolledUpWeight = weightW.rolledUpWeight;
    if (weightW.rolledUpCompletedWeight != null)
      result.rolledUpCompletedWeight = weightW.rolledUpCompletedWeight;
  }

  const healthW = findWidget(widgets, "WorkItemWidgetHealthStatus");
  if (healthW?.healthStatus) result.healthStatus = healthW.healthStatus;
}

function extractMetadataWidgets(widgets: WorkItemRaw[], result: Record<string, unknown>): void {
  const datesW = findWidget(widgets, "WorkItemWidgetStartAndDueDate");
  if (datesW?.startDate) result.startDate = datesW.startDate;
  if (datesW?.dueDate) result.dueDate = datesW.dueDate;

  const milestoneW = findWidget(widgets, "WorkItemWidgetMilestone");
  if (milestoneW?.milestone)
    result.milestone = { id: milestoneW.milestone.id, title: milestoneW.milestone.title };

  const iterW = findWidget(widgets, "WorkItemWidgetIteration");
  if (iterW?.iteration) {
    result.iteration = {
      id: iterW.iteration.id,
      title: iterW.iteration.title,
      startDate: iterW.iteration.startDate,
      dueDate: iterW.iteration.dueDate,
    };
  }

  const progressW = findWidget(widgets, "WorkItemWidgetProgress");
  if (progressW?.progress != null) result.progress = progressW.progress;

  const colorW = findWidget(widgets, "WorkItemWidgetColor");
  if (colorW?.color) result.color = colorW.color;

  const timeW = findWidget(widgets, "WorkItemWidgetTimeTracking");
  if (timeW?.timeEstimate > 0) result.timeEstimate = timeW.timeEstimate;
  if (timeW?.totalTimeSpent > 0) result.totalTimeSpent = timeW.totalTimeSpent;
}

function extractHierarchyWidget(widgets: WorkItemRaw[], result: Record<string, unknown>): void {
  const hierW = findWidget(widgets, "WorkItemWidgetHierarchy");
  if (hierW?.parent)
    result.parent = {
      iid: hierW.parent.iid,
      title: hierW.parent.title,
      type: hierW.parent.workItemType?.name,
      project: hierW.parent.namespace?.fullPath,
      webUrl: hierW.parent.webUrl,
    };
  const children = hierW?.children?.nodes || [];
  if (children.length > 0)
    result.children = children.map((c: WorkItemRaw) => ({
      iid: c.iid,
      title: c.title,
      state: c.state,
      type: c.workItemType?.name,
      project: c.namespace?.fullPath,
      webUrl: c.webUrl,
    }));
}

function extractLinkedItemsWidget(widgets: WorkItemRaw[], result: Record<string, unknown>): void {
  const linkedW = findWidget(widgets, "WorkItemWidgetLinkedItems");
  if (linkedW?.blocked) result.blocked = true;
  if (linkedW?.blockedByCount > 0) result.blockedByCount = linkedW.blockedByCount;
  if (linkedW?.blockingCount > 0) result.blockingCount = linkedW.blockingCount;
  const linkedNodes = linkedW?.linkedItems?.nodes || [];
  if (linkedNodes.length > 0) {
    result.linkedItems = linkedNodes.map((n: WorkItemRaw) => ({
      linkType: n.linkType,
      iid: n.workItem?.iid,
      title: n.workItem?.title,
      state: n.workItem?.state,
      type: n.workItem?.workItemType?.name,
      project: n.workItem?.namespace?.fullPath,
      webUrl: n.workItem?.webUrl,
    }));
  }
}

function extractDevelopmentWidget(widgets: WorkItemRaw[], result: Record<string, unknown>): void {
  const devW = findWidget(widgets, "WorkItemWidgetDevelopment");
  const relatedMRs = devW?.relatedMergeRequests?.nodes || [];
  const closingMRs = (devW?.closingMergeRequests?.nodes || []).map(
    (n: WorkItemRaw) => n.mergeRequest,
  );
  const branches = devW?.relatedBranches?.nodes || [];
  const flags = devW?.featureFlags?.nodes || [];
  if (relatedMRs.length > 0 || closingMRs.length > 0 || branches.length > 0 || flags.length > 0) {
    const dev: Record<string, unknown> = {};
    if (relatedMRs.length > 0) dev.relatedMergeRequests = relatedMRs;
    if (closingMRs.length > 0) dev.closingMergeRequests = closingMRs;
    if (branches.length > 0) dev.relatedBranches = branches.map((b: WorkItemRaw) => b.name);
    if (flags.length > 0) dev.featureFlags = flags;
    result.development = dev;
  }
}

function extractCustomFieldsWidget(widgets: WorkItemRaw[], result: Record<string, unknown>): void {
  const cfW = findWidget(widgets, "WorkItemWidgetCustomFields");
  const cfValues = (cfW?.customFieldValues || []).filter(
    (cfv: WorkItemRaw) => cfv.value != null || cfv.selectedOptions != null,
  );
  if (cfValues.length > 0) {
    result.customFields = cfValues.map((cfv: WorkItemRaw) => ({
      name: cfv.customField?.name,
      type: cfv.customField?.fieldType,
      value: cfv.value ?? cfv.selectedOptions ?? null,
    }));
  }
}

function extractRelationWidgets(widgets: WorkItemRaw[], result: Record<string, unknown>): void {
  extractHierarchyWidget(widgets, result);
  extractLinkedItemsWidget(widgets, result);
  extractDevelopmentWidget(widgets, result);
  extractCustomFieldsWidget(widgets, result);
}

function flattenWorkItem(wi: WorkItemRaw): Record<string, unknown> {
  const widgets: WorkItemRaw[] = wi.widgets || [];

  const result: Record<string, unknown> = {
    id: wi.id,
    iid: wi.iid,
    title: wi.title,
    state: wi.state,
    type: wi.workItemType?.name,
    webUrl: wi.webUrl,
  };

  if (wi.description) result.description = wi.description;
  if (wi.confidential) result.confidential = true;
  if (wi.author?.username) result.author = wi.author.username;
  if (wi.createdAt) result.createdAt = wi.createdAt;
  if (wi.closedAt) result.closedAt = wi.closedAt;

  extractCoreWidgets(widgets, result);
  extractMetadataWidgets(widgets, result);
  extractRelationWidgets(widgets, result);

  return result;
}

function flattenWorkItemSummary(wi: WorkItemRaw): Record<string, unknown> {
  const widgets: WorkItemRaw[] = wi.widgets || [];
  const item: Record<string, unknown> = {
    iid: wi.iid,
    title: wi.title,
    state: wi.state,
    type: wi.workItemType?.name,
    webUrl: wi.webUrl,
  };
  const statusW = findWidget(widgets, "WorkItemWidgetStatus");
  if (statusW?.status) item.status = statusW.status.name;
  const labelsW = findWidget(widgets, "WorkItemWidgetLabels");
  const labels = (labelsW?.labels?.nodes || []).map((l: WorkItemRaw) => l.title);
  if (labels.length > 0) item.labels = labels;
  const assigneesW = findWidget(widgets, "WorkItemWidgetAssignees");
  const assignees = (assigneesW?.assignees?.nodes || []).map((a: WorkItemRaw) => a.username);
  if (assignees.length > 0) item.assignees = assignees;
  const weightW = findWidget(widgets, "WorkItemWidgetWeight");
  if (weightW?.weight != null) item.weight = weightW.weight;
  const healthW = findWidget(widgets, "WorkItemWidgetHealthStatus");
  if (healthW?.healthStatus) item.healthStatus = healthW.healthStatus;
  const datesW = findWidget(widgets, "WorkItemWidgetStartAndDueDate");
  if (datesW?.startDate) item.startDate = datesW.startDate;
  if (datesW?.dueDate) item.dueDate = datesW.dueDate;
  const milestoneW = findWidget(widgets, "WorkItemWidgetMilestone");
  if (milestoneW?.milestone) item.milestone = milestoneW.milestone.title;
  return item;
}

async function listWorkItems(
  projectId: string,
  options: {
    types?: string[];
    state?: string;
    search?: string;
    assignee_usernames?: string[];
    label_names?: string[];
    first?: number;
    after?: string;
  },
): Promise<Record<string, unknown>> {
  const projectPath = await resolveProjectPath(projectId);

  const typeMap: Record<string, string> = {
    issue: "ISSUE",
    task: "TASK",
    incident: "INCIDENT",
    test_case: "TEST_CASE",
    epic: "EPIC",
    key_result: "KEY_RESULT",
    objective: "OBJECTIVE",
    requirement: "REQUIREMENT",
    ticket: "TICKET",
  };

  const variables: Record<string, unknown> = {
    path: projectPath,
    first: options.first || 20,
  };

  if (options.types?.length)
    variables.types = options.types.map((t) => typeMap[t] || t.replace(/ /g, "_").toUpperCase());
  if (options.state) variables.state = options.state === "opened" ? "opened" : "closed";
  if (options.search) variables.search = options.search;
  if (options.assignee_usernames?.length) variables.assigneeUsernames = options.assignee_usernames;
  if (options.label_names?.length) variables.labelName = options.label_names;
  if (options.after) variables.after = options.after;

  const data = await defaultClient.graphql<{ project: WorkItemRaw }>(
    `query($path: ID!, $types: [IssueType!], $state: IssuableState, $search: String, $assigneeUsernames: [String!], $labelName: [String!], $first: Int, $after: String) {
      project(fullPath: $path) {
        workItems(types: $types, state: $state, search: $search, assigneeUsernames: $assigneeUsernames, labelName: $labelName, first: $first, after: $after) {
          nodes {
            id iid title state webUrl workItemType { name }
            widgets {
              __typename
              ... on WorkItemWidgetStatus { status { id name category color } }
              ... on WorkItemWidgetLabels { labels { nodes { title } } }
              ... on WorkItemWidgetAssignees { assignees { nodes { username } } }
              ... on WorkItemWidgetWeight { weight }
              ... on WorkItemWidgetHealthStatus { healthStatus }
              ... on WorkItemWidgetStartAndDueDate { startDate dueDate }
              ... on WorkItemWidgetMilestone { milestone { id title } }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }`,
    variables,
  );

  const workItems = data.project?.workItems?.nodes || [];
  const pageInfo = data.project?.workItems?.pageInfo || {};

  const items = workItems.map(flattenWorkItemSummary);

  return { items, pageInfo };
}

function addCommonWidgetFields(
  builder: MutationBuilder,
  options: {
    weight?: number;
    health_status?: string;
    start_date?: string;
    due_date?: string;
    milestone_id?: string;
    iteration_id?: string;
    confidential?: boolean;
  },
): void {
  if (options.weight !== undefined) {
    builder.varDefs.push("$weight: Int");
    builder.inputParts.push("weightWidget: { weight: $weight }");
    builder.variables.weight = options.weight;
  }

  if (options.health_status !== undefined) {
    builder.varDefs.push("$healthStatus: HealthStatus");
    builder.inputParts.push("healthStatusWidget: { healthStatus: $healthStatus }");
    builder.variables.healthStatus = options.health_status;
  }

  if (options.start_date !== undefined || options.due_date !== undefined) {
    const dateParts: string[] = [];
    if (options.start_date !== undefined) {
      builder.varDefs.push("$startDate: Date");
      dateParts.push("startDate: $startDate");
      builder.variables.startDate = options.start_date;
    }
    if (options.due_date !== undefined) {
      builder.varDefs.push("$dueDate: Date");
      dateParts.push("dueDate: $dueDate");
      builder.variables.dueDate = options.due_date;
    }
    builder.inputParts.push(`startAndDueDateWidget: { ${dateParts.join(", ")} }`);
  }

  if (options.milestone_id !== undefined) {
    builder.varDefs.push("$milestoneId: MilestoneID");
    builder.inputParts.push("milestoneWidget: { milestoneId: $milestoneId }");
    builder.variables.milestoneId = toGID(options.milestone_id, "Milestone");
  }

  if (options.iteration_id !== undefined) {
    builder.varDefs.push("$iterationId: IterationID");
    builder.inputParts.push("iterationWidget: { iterationId: $iterationId }");
    builder.variables.iterationId = toGID(options.iteration_id, "Iteration");
  }

  if (options.confidential !== undefined) {
    builder.varDefs.push("$confidential: Boolean");
    builder.inputParts.push("confidential: $confidential");
    builder.variables.confidential = options.confidential;
  }
}

async function createWorkItem(
  projectId: string,
  options: {
    title: string;
    type?: string;
    description?: string;
    labels?: string[];
    assignee_usernames?: string[];
    parent_iid?: number;
    weight?: number;
    health_status?: string;
    start_date?: string;
    due_date?: string;
    milestone_id?: string;
    iteration_id?: string;
    confidential?: boolean;
  },
): Promise<Record<string, unknown>> {
  const projectPath = await resolveProjectPath(projectId);
  const typeName = options.type || "issue";
  const typeGID = await resolveWorkItemTypeGID(projectPath, typeName);

  const builder: MutationBuilder = {
    varDefs: ["$projectPath: ID!", "$title: String!", "$typeId: WorkItemsTypeID!"],
    inputParts: ["namespacePath: $projectPath", "title: $title", "workItemTypeId: $typeId"],
    variables: { projectPath, title: options.title, typeId: typeGID },
  };

  if (options.description !== undefined) {
    builder.varDefs.push("$description: String!");
    builder.inputParts.push("descriptionWidget: { description: $description }");
    builder.variables.description = options.description;
  }

  const { labelIds, userIds } = await resolveNamesToIds(
    projectPath,
    options.labels,
    options.assignee_usernames,
  );

  if (labelIds.length > 0) {
    builder.varDefs.push("$labelIds: [LabelID!]!");
    builder.inputParts.push("labelsWidget: { labelIds: $labelIds }");
    builder.variables.labelIds = labelIds;
  }

  if (options.parent_iid !== undefined) {
    const { workItemGID: parentGID } = await resolveWorkItemGID(projectId, options.parent_iid);
    builder.varDefs.push("$parentId: WorkItemID");
    builder.inputParts.push("hierarchyWidget: { parentId: $parentId }");
    builder.variables.parentId = parentGID;
  }

  if (userIds.length > 0) {
    builder.varDefs.push("$assigneeIds: [UserID!]!");
    builder.inputParts.push("assigneesWidget: { assigneeIds: $assigneeIds }");
    builder.variables.assigneeIds = userIds;
  }

  addCommonWidgetFields(builder, options);

  const mutation = `mutation(${builder.varDefs.join(", ")}) {
    workItemCreate(input: { ${builder.inputParts.join(", ")} }) {
      workItem { id iid title webUrl workItemType { name } }
      errors
    }
  }`;

  const data = await defaultClient.graphql<{
    workItemCreate: { workItem: WorkItemRaw; errors: string[] };
  }>(mutation, builder.variables);

  if (data.workItemCreate.errors?.length > 0) {
    throw new Error(`Failed to create work item: ${data.workItemCreate.errors.join(", ")}`);
  }

  const wi = data.workItemCreate.workItem;
  return {
    id: wi.id,
    iid: wi.iid,
    title: wi.title,
    type: wi.workItemType?.name,
    webUrl: wi.webUrl,
  };
}

async function buildUpdateMutationFields(
  projectId: string,
  projectPath: string,
  workItemGID: string,
  options: Record<string, unknown>,
): Promise<MutationBuilder> {
  const builder: MutationBuilder = {
    varDefs: ["$id: WorkItemID!"],
    inputParts: ["id: $id"],
    variables: { id: workItemGID },
  };

  if (options.title !== undefined) {
    builder.varDefs.push("$title: String");
    builder.inputParts.push("title: $title");
    builder.variables.title = options.title;
  }

  if (options.description !== undefined) {
    builder.varDefs.push("$description: String!");
    builder.inputParts.push("descriptionWidget: { description: $description }");
    builder.variables.description = options.description;
  }

  addUpdateLabelsAndAssignees(builder, projectPath, options);

  if (options.state_event !== undefined) {
    builder.varDefs.push("$stateEvent: WorkItemStateEvent");
    builder.inputParts.push("stateEvent: $stateEvent");
    builder.variables.stateEvent = options.state_event === "close" ? "CLOSE" : "REOPEN";
  }

  if (options.status !== undefined) {
    builder.varDefs.push("$status: WorkItemsStatusesStatusID");
    builder.inputParts.push("statusWidget: { status: $status }");
    builder.variables.status = options.status;
  }

  addCommonWidgetFields(builder, {
    weight: options.weight as number | undefined,
    health_status: options.health_status as string | undefined,
    start_date: options.start_date as string | undefined,
    due_date: options.due_date as string | undefined,
    milestone_id: options.milestone_id as string | undefined,
    iteration_id: options.iteration_id as string | undefined,
    confidential: options.confidential as boolean | undefined,
  });

  addUpdateCustomFields(builder, options);
  await addUpdateHierarchy(builder, projectId, options);

  return builder;
}

async function addUpdateLabelsAndAssignees(
  builder: MutationBuilder,
  projectPath: string,
  options: Record<string, unknown>,
): Promise<void> {
  const allLabelNames = [
    ...((options.add_labels as string[]) || []),
    ...((options.remove_labels as string[]) || []),
  ];
  const needsResolve =
    allLabelNames.length > 0 || (options.assignee_usernames as string[] | undefined)?.length;
  const { labelIds: resolvedLabelIds, userIds } = needsResolve
    ? await resolveNamesToIds(
        projectPath,
        allLabelNames.length > 0 ? allLabelNames : undefined,
        options.assignee_usernames as string[] | undefined,
      )
    : { labelIds: [] as string[], userIds: [] as string[] };

  if (options.add_labels || options.remove_labels) {
    const labelParts: string[] = [];
    let offset = 0;
    if ((options.add_labels as string[] | undefined)?.length) {
      const addIds = resolvedLabelIds.slice(0, (options.add_labels as string[]).length);
      offset = (options.add_labels as string[]).length;
      builder.varDefs.push("$addLabelIds: [LabelID!]");
      labelParts.push("addLabelIds: $addLabelIds");
      builder.variables.addLabelIds = addIds;
    }
    if ((options.remove_labels as string[] | undefined)?.length) {
      const removeIds = resolvedLabelIds.slice(offset);
      builder.varDefs.push("$removeLabelIds: [LabelID!]");
      labelParts.push("removeLabelIds: $removeLabelIds");
      builder.variables.removeLabelIds = removeIds;
    }
    if (labelParts.length > 0) {
      builder.inputParts.push(`labelsWidget: { ${labelParts.join(", ")} }`);
    }
  }

  if (userIds.length > 0) {
    builder.varDefs.push("$assigneeIds: [UserID!]!");
    builder.inputParts.push("assigneesWidget: { assigneeIds: $assigneeIds }");
    builder.variables.assigneeIds = userIds;
  }
}

function addUpdateCustomFields(builder: MutationBuilder, options: Record<string, unknown>): void {
  if (!options.custom_fields || !(options.custom_fields as unknown[]).length) return;

  const cfInput = (
    options.custom_fields as Array<{
      custom_field_id: string;
      text_value?: string;
      number_value?: number;
      selected_option_ids?: string[];
      date_value?: string;
    }>
  ).map((cf) => {
    const val: Record<string, unknown> = {
      customFieldId: toGID(cf.custom_field_id, "IssuablesCustomField"),
    };
    if (cf.text_value !== undefined) val.textValue = cf.text_value;
    if (cf.number_value !== undefined) val.numberValue = cf.number_value;
    if (cf.selected_option_ids !== undefined) val.selectedOptionIds = cf.selected_option_ids;
    if (cf.date_value !== undefined) val.dateValue = cf.date_value;
    return val;
  });
  builder.varDefs.push("$customFieldsWidget: [WorkItemWidgetCustomFieldValueInputType!]");
  builder.inputParts.push("customFieldsWidget: $customFieldsWidget");
  builder.variables.customFieldsWidget = cfInput;
}

async function addUpdateHierarchy(
  builder: MutationBuilder,
  projectId: string,
  options: Record<string, unknown>,
): Promise<void> {
  if (options.remove_parent) {
    builder.inputParts.push("hierarchyWidget: { parentId: null }");
  } else if (options.parent_iid !== undefined) {
    const parentProjectId = (options.parent_project_id as string) || projectId;
    const { workItemGID: parentGID } = await resolveWorkItemGID(
      parentProjectId,
      options.parent_iid as number,
    );
    builder.varDefs.push("$parentId: WorkItemID");
    builder.inputParts.push("hierarchyWidget: { parentId: $parentId }");
    builder.variables.parentId = parentGID;
  }
}

async function handleChildrenToAdd(
  workItemGID: string,
  options: Record<string, unknown>,
): Promise<void> {
  const childrenToAdd = options.children_to_add as
    | Array<{ project_id: string; iid: number }>
    | undefined;
  if (!childrenToAdd?.length) return;

  const childGIDs: string[] = [];
  for (const child of childrenToAdd) {
    const { workItemGID: childGID } = await resolveWorkItemGID(child.project_id, child.iid);
    childGIDs.push(childGID);
  }
  const addData = await defaultClient.graphql<{
    workItemUpdate: { errors: string[] };
  }>(
    `mutation($id: WorkItemID!, $childrenIds: [WorkItemID!]!) {
      workItemUpdate(input: { id: $id, hierarchyWidget: { childrenIds: $childrenIds } }) { errors }
    }`,
    { id: workItemGID, childrenIds: childGIDs },
  );
  if (addData.workItemUpdate.errors?.length > 0) {
    throw new Error(`Failed to add children: ${addData.workItemUpdate.errors.join(", ")}`);
  }
}

async function handleChildrenToRemove(options: Record<string, unknown>): Promise<void> {
  const childrenToRemove = options.children_to_remove as
    | Array<{ project_id: string; iid: number }>
    | undefined;
  if (!childrenToRemove?.length) return;

  for (const child of childrenToRemove) {
    await removeIssueParent(child.project_id, child.iid);
  }
}

async function handleLinkedItemsToAdd(
  workItemGID: string,
  options: Record<string, unknown>,
): Promise<void> {
  const linkedToAdd = options.linked_items_to_add as
    | Array<{ project_id: string; iid: number; link_type?: string }>
    | undefined;
  if (!linkedToAdd?.length) return;

  const groupedByType: Record<string, string[]> = {};
  for (const item of linkedToAdd) {
    const linkType = item.link_type || "RELATED";
    if (!groupedByType[linkType]) groupedByType[linkType] = [];
    const { workItemGID: targetGID } = await resolveWorkItemGID(item.project_id, item.iid);
    groupedByType[linkType].push(targetGID);
  }
  for (const [linkType, targetGIDs] of Object.entries(groupedByType)) {
    const addLinkedData = await defaultClient.graphql<{
      workItemAddLinkedItems: { errors: string[] };
    }>(
      `mutation($id: WorkItemID!, $workItemsIds: [WorkItemID!]!, $linkType: WorkItemRelatedLinkType!) {
        workItemAddLinkedItems(input: { id: $id, workItemsIds: $workItemsIds, linkType: $linkType }) { errors }
      }`,
      { id: workItemGID, workItemsIds: targetGIDs, linkType },
    );
    if (addLinkedData.workItemAddLinkedItems.errors?.length > 0) {
      throw new Error(
        `Failed to add linked items: ${addLinkedData.workItemAddLinkedItems.errors.join(", ")}`,
      );
    }
  }
}

async function handleLinkedItemsToRemove(
  workItemGID: string,
  options: Record<string, unknown>,
): Promise<void> {
  const linkedToRemove = options.linked_items_to_remove as
    | Array<{ project_id: string; iid: number }>
    | undefined;
  if (!linkedToRemove?.length) return;

  const targetGIDs: string[] = [];
  for (const item of linkedToRemove) {
    const { workItemGID: targetGID } = await resolveWorkItemGID(item.project_id, item.iid);
    targetGIDs.push(targetGID);
  }
  const removeLinkedData = await defaultClient.graphql<{
    workItemRemoveLinkedItems: { errors: string[] };
  }>(
    `mutation($id: WorkItemID!, $workItemsIds: [WorkItemID!]!) {
      workItemRemoveLinkedItems(input: { id: $id, workItemsIds: $workItemsIds }) { errors }
    }`,
    { id: workItemGID, workItemsIds: targetGIDs },
  );
  if (removeLinkedData.workItemRemoveLinkedItems.errors?.length > 0) {
    throw new Error(
      `Failed to remove linked items: ${removeLinkedData.workItemRemoveLinkedItems.errors.join(", ")}`,
    );
  }
}

async function handleUpdateSideEffects(
  workItemGID: string,
  projectPath: string,
  iid: number,
  options: Record<string, unknown>,
): Promise<void> {
  await handleChildrenToAdd(workItemGID, options);
  await handleChildrenToRemove(options);
  await handleLinkedItemsToAdd(workItemGID, options);
  await handleLinkedItemsToRemove(workItemGID, options);

  if (options.severity !== undefined) {
    await updateIncidentSeverity(projectPath, iid, options.severity as string);
  }
  if (options.escalation_status !== undefined) {
    await updateIncidentEscalationStatus(projectPath, iid, options.escalation_status as string);
  }
}

function flattenUpdateWidgets(wi: WorkItemRaw): Record<string, unknown> {
  const widgets: WorkItemRaw[] = wi?.widgets || [];
  const statusW = findWidget(widgets, "WorkItemWidgetStatus");
  const labelsW = findWidget(widgets, "WorkItemWidgetLabels");
  const assigneesW = findWidget(widgets, "WorkItemWidgetAssignees");
  const weightW = findWidget(widgets, "WorkItemWidgetWeight");
  const hierarchyW = findWidget(widgets, "WorkItemWidgetHierarchy");
  const healthStatusW = findWidget(widgets, "WorkItemWidgetHealthStatus");
  const datesW = findWidget(widgets, "WorkItemWidgetStartAndDueDate");
  const milestoneW = findWidget(widgets, "WorkItemWidgetMilestone");

  return {
    id: wi.id,
    iid: wi.iid,
    title: wi.title,
    state: wi.state,
    type: wi.workItemType?.name,
    webUrl: wi.webUrl,
    status: statusW?.status || null,
    labels: (labelsW?.labels?.nodes || []).map((l: WorkItemRaw) => l.title),
    assignees: (assigneesW?.assignees?.nodes || []).map((a: WorkItemRaw) => a.username),
    weight: weightW?.weight ?? null,
    parent: hierarchyW?.parent || null,
    healthStatus: healthStatusW?.healthStatus || null,
    startDate: datesW?.startDate || null,
    dueDate: datesW?.dueDate || null,
    milestone: milestoneW?.milestone || null,
  };
}

function buildSideEffectCounts(options: Record<string, unknown>): Record<string, unknown> {
  const counts: Record<string, unknown> = {
    children_added: (options.children_to_add as unknown[] | undefined)?.length || 0,
    children_removed: (options.children_to_remove as unknown[] | undefined)?.length || 0,
    linked_items_added: (options.linked_items_to_add as unknown[] | undefined)?.length || 0,
    linked_items_removed: (options.linked_items_to_remove as unknown[] | undefined)?.length || 0,
  };
  if (options.severity !== undefined) counts.severity = options.severity;
  if (options.escalation_status !== undefined) counts.escalation_status = options.escalation_status;
  return counts;
}

async function updateWorkItem(
  projectId: string,
  iid: number,
  options: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { workItemGID, projectPath } = await resolveWorkItemGID(projectId, iid);

  const builder = await buildUpdateMutationFields(projectId, projectPath, workItemGID, options);

  const mutation = `mutation(${builder.varDefs.join(", ")}) {
    workItemUpdate(input: { ${builder.inputParts.join(", ")} }) {
      workItem {
        id iid title state webUrl workItemType { name }
        widgets {
          __typename
          ... on WorkItemWidgetStatus { status { id name category color } }
          ... on WorkItemWidgetLabels { labels { nodes { title } } }
          ... on WorkItemWidgetAssignees { assignees { nodes { username } } }
          ... on WorkItemWidgetWeight { weight }
          ... on WorkItemWidgetHierarchy { parent { id title workItemType { name } } }
          ... on WorkItemWidgetHealthStatus { healthStatus }
          ... on WorkItemWidgetStartAndDueDate { startDate dueDate }
          ... on WorkItemWidgetMilestone { milestone { id title } }
        }
      }
      errors
    }
  }`;

  const data = await defaultClient.graphql<{
    workItemUpdate: { workItem: WorkItemRaw; errors: string[] };
  }>(mutation, builder.variables);

  if (data.workItemUpdate.errors?.length > 0) {
    throw new Error(`Failed to update work item: ${data.workItemUpdate.errors.join(", ")}`);
  }

  await handleUpdateSideEffects(workItemGID, projectPath, iid, options);

  return {
    ...flattenUpdateWidgets(data.workItemUpdate.workItem),
    ...buildSideEffectCounts(options),
  };
}

async function convertWorkItemType(
  projectId: string,
  iid: number,
  newType: string,
): Promise<{ id: string; type: string }> {
  const { workItemGID, projectPath } = await resolveWorkItemGID(projectId, iid);
  const workItemTypeGID = await resolveWorkItemTypeGID(projectPath, newType);

  const data = await defaultClient.graphql<{
    workItemConvert: {
      workItem: { id: string; workItemType: { name: string } } | null;
      errors: string[];
    };
  }>(
    `mutation($id: WorkItemID!, $typeId: WorkItemsTypeID!) {
      workItemConvert(input: { id: $id, workItemTypeId: $typeId }) {
        workItem { id workItemType { name } }
        errors
      }
    }`,
    { id: workItemGID, typeId: workItemTypeGID },
  );

  if (data.workItemConvert.errors?.length > 0) {
    throw new Error(`Conversion failed: ${data.workItemConvert.errors.join(", ")}`);
  }

  const converted = data.workItemConvert.workItem;
  if (!converted) {
    throw new Error("Conversion succeeded but returned no work item");
  }
  return {
    id: converted.id,
    type: converted.workItemType.name,
  };
}

async function listWorkItemStatuses(
  projectId: string,
  workItemType: string = "issue",
): Promise<Record<string, unknown>> {
  const projectPath = await resolveProjectPath(projectId);
  const typeName = WORK_ITEM_TYPE_NAMES[workItemType] || "Issue";

  const data = await defaultClient.graphql<{ namespace: WorkItemRaw }>(
    `query($path: ID!, $typeName: IssueType) {
      namespace(fullPath: $path) {
        workItemTypes(name: $typeName) {
          nodes {
            id name
            supportedConversionTypes { id name }
            widgetDefinitions {
              __typename
              ... on WorkItemWidgetDefinitionStatus {
                allowedStatuses { id name iconName color position }
              }
              ... on WorkItemWidgetDefinitionHierarchy {
                allowedChildTypes { nodes { id name } }
                allowedParentTypes { nodes { id name } }
              }
            }
          }
        }
      }
    }`,
    { path: projectPath, typeName: typeName.replace(/ /g, "_").toUpperCase() },
  );

  const typeNodes = data.namespace?.workItemTypes?.nodes;
  if (!typeNodes?.length) {
    throw new Error(`Work item type '${typeName}' not found in project`);
  }

  const typeNode = typeNodes[0];
  const statusWidget = findWidget(
    typeNode.widgetDefinitions || [],
    "WorkItemWidgetDefinitionStatus",
  );
  const statuses = statusWidget?.allowedStatuses || [];
  const hierarchyWidget = findWidget(
    typeNode.widgetDefinitions || [],
    "WorkItemWidgetDefinitionHierarchy",
  );

  const result: Record<string, unknown> = {
    work_item_type: typeNode.name,
    statuses_available: statuses.length > 0,
    statuses,
  };

  const conversionTypes = typeNode.supportedConversionTypes || [];
  if (conversionTypes.length > 0)
    result.supported_conversion_types = conversionTypes.map((t: WorkItemRaw) => t.name);

  const childTypes = hierarchyWidget?.allowedChildTypes?.nodes || [];
  const parentTypes = hierarchyWidget?.allowedParentTypes?.nodes || [];
  if (childTypes.length > 0)
    result.allowed_child_types = childTypes.map((t: WorkItemRaw) => t.name);
  if (parentTypes.length > 0)
    result.allowed_parent_types = parentTypes.map((t: WorkItemRaw) => t.name);

  return result;
}

async function listCustomFieldDefinitions(
  projectId: string,
  workItemType: string = "issue",
): Promise<Record<string, unknown>> {
  const projectPath = await resolveProjectPath(projectId);
  const typeName = WORK_ITEM_TYPE_NAMES[workItemType] || "Issue";

  const data = await defaultClient.graphql<{ namespace: WorkItemRaw }>(
    `query($path: ID!, $typeName: IssueType) {
      namespace(fullPath: $path) {
        workItemTypes(name: $typeName) {
          nodes {
            id name
            widgetDefinitions {
              __typename
              ... on WorkItemWidgetDefinitionCustomFields {
                customFieldValues {
                  customField { id name fieldType selectOptions { id value } workItemTypes { id name } }
                }
              }
            }
          }
        }
      }
    }`,
    { path: projectPath, typeName: typeName.replace(/ /g, "_").toUpperCase() },
  );

  const typeNodes = data.namespace?.workItemTypes?.nodes;
  if (!typeNodes?.length) {
    throw new Error(`Work item type '${typeName}' not found in project`);
  }

  const typeNode = typeNodes[0];
  const cfWidget = findWidget(
    typeNode.widgetDefinitions || [],
    "WorkItemWidgetDefinitionCustomFields",
  );

  const fields = (cfWidget?.customFieldValues || []).map((cfv: WorkItemRaw) => {
    const cf = cfv.customField;
    const field: Record<string, unknown> = { id: cf?.id, name: cf?.name, type: cf?.fieldType };
    const opts = cf?.selectOptions || [];
    if (opts.length > 0) field.selectOptions = opts;
    const types = (cf?.workItemTypes || []).map((t: WorkItemRaw) => t.name);
    if (types.length > 0) field.workItemTypes = types;
    return field;
  });

  return { work_item_type: typeNode.name, custom_fields: fields };
}

async function moveWorkItem(
  projectId: string,
  iid: number,
  targetProjectId: string,
): Promise<unknown> {
  const projectPath = await resolveProjectPath(projectId);
  const targetPath = await resolveProjectPath(targetProjectId);

  const data = await defaultClient.graphql<{
    issueMove: {
      issue: { id: string; iid: string; webUrl: string } | null;
      errors: string[];
    };
  }>(
    `mutation($projectPath: ID!, $iid: String!, $targetProjectPath: ID!) {
      issueMove(input: { projectPath: $projectPath, iid: $iid, targetProjectPath: $targetProjectPath }) {
        issue { id iid webUrl }
        errors
      }
    }`,
    { projectPath, iid: String(iid), targetProjectPath: targetPath },
  );

  if (data.issueMove.errors?.length > 0) {
    throw new Error(`Failed to move work item: ${data.issueMove.errors.join(", ")}`);
  }

  return data.issueMove.issue;
}

async function listWorkItemNotes(
  projectId: string,
  iid: number,
  options: { page_size?: number; after?: string; sort?: string } = {},
): Promise<Record<string, unknown>> {
  const projectPath = await resolveProjectPath(projectId);

  const data = await defaultClient.graphql<{ namespace: WorkItemRaw }>(
    `query($path: ID!, $iid: String!, $pageSize: Int, $after: String, $sort: WorkItemDiscussionsSort) {
      namespace(fullPath: $path) {
        workItem(iid: $iid) {
          id
          widgets(onlyTypes: [NOTES]) {
            ... on WorkItemWidgetNotes {
              discussionLocked
              discussions(first: $pageSize, after: $after, filter: ALL_NOTES, sort: $sort) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  id resolved resolvable
                  notes {
                    nodes { id body system internal createdAt lastEditedAt author { username } }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    {
      path: projectPath,
      iid: String(iid),
      pageSize: options.page_size || 20,
      after: options.after || null,
      sort: options.sort || "CREATED_ASC",
    },
  );

  const workItem = data.namespace?.workItem;
  if (!workItem) {
    throw new Error(`Work item #${iid} not found in project ${projectPath}`);
  }

  const notesWidget = (workItem.widgets || []).find((w: WorkItemRaw) => w.discussions);
  const discussions = notesWidget?.discussions;

  const items = (discussions?.nodes || []).map((d: WorkItemRaw) => {
    const notes = (d.notes?.nodes || []).map((n: WorkItemRaw) => {
      const note: Record<string, unknown> = {
        id: n.id,
        author: n.author?.username,
        body: n.body,
        createdAt: n.createdAt,
      };
      if (n.system) note.system = true;
      if (n.internal) note.internal = true;
      if (n.lastEditedAt) note.lastEditedAt = n.lastEditedAt;
      return note;
    });
    const discussion: Record<string, unknown> = { id: d.id, notes };
    if (d.resolved) discussion.resolved = true;
    if (d.resolvable) discussion.resolvable = true;
    return discussion;
  });

  return { discussions: items, pageInfo: discussions?.pageInfo || {} };
}

async function createWorkItemNote(
  projectId: string,
  iid: number,
  body: string,
  options: { internal?: boolean; discussion_id?: string } = {},
): Promise<unknown> {
  const { workItemGID } = await resolveWorkItemGID(projectId, iid);

  const varDefs = ["$notableId: NotableID!", "$body: String!"];
  const inputParts = ["notableId: $notableId", "body: $body"];
  const variables: Record<string, unknown> = { notableId: workItemGID, body };

  if (options.internal) {
    varDefs.push("$internal: Boolean");
    inputParts.push("internal: $internal");
    variables.internal = true;
  }

  if (options.discussion_id) {
    varDefs.push("$discussionId: DiscussionID");
    inputParts.push("discussionId: $discussionId");
    variables.discussionId = options.discussion_id;
  }

  const data = await defaultClient.graphql<{
    createNote: {
      note: { id: string; body: string; discussion: { id: string } } | null;
      errors: string[];
    };
  }>(
    `mutation(${varDefs.join(", ")}) {
      createNote(input: { ${inputParts.join(", ")} }) {
        note { id body discussion { id } }
        errors
      }
    }`,
    variables,
  );

  if (data.createNote.errors?.length > 0) {
    throw new Error(`Failed to create note: ${data.createNote.errors.join(", ")}`);
  }

  return data.createNote.note;
}

async function getTimelineEvents(projectId: string, incidentIid: number): Promise<unknown[]> {
  const { workItemGID, projectPath } = await resolveWorkItemGID(projectId, incidentIid);
  const incidentGID = workItemGID.replace("/WorkItem/", "/Issue/");

  const data = await defaultClient.graphql<{ project: WorkItemRaw }>(
    `query($fullPath: ID!, $incidentId: IssueID!) {
      project(fullPath: $fullPath) {
        incidentManagementTimelineEvents(incidentId: $incidentId) {
          nodes { id note noteHtml action occurredAt createdAt timelineEventTags { nodes { id name } } }
        }
      }
    }`,
    { fullPath: projectPath, incidentId: incidentGID },
  );

  const events = data.project?.incidentManagementTimelineEvents?.nodes || [];
  return events.map((e: WorkItemRaw) => {
    const event: Record<string, unknown> = {
      id: e.id,
      note: e.note,
      action: e.action,
      occurredAt: e.occurredAt,
      createdAt: e.createdAt,
    };
    if (e.noteHtml) event.noteHtml = e.noteHtml;
    const tags = (e.timelineEventTags?.nodes || []).map((t: WorkItemRaw) => t.name);
    if (tags.length > 0) event.tags = tags;
    return event;
  });
}

async function createTimelineEvent(
  projectId: string,
  incidentIid: number,
  note: string,
  occurredAt: string,
  tagNames?: string[],
): Promise<Record<string, unknown>> {
  const { workItemGID } = await resolveWorkItemGID(projectId, incidentIid);
  const incidentGID = workItemGID.replace("/WorkItem/", "/Issue/");

  const input: Record<string, unknown> = { incidentId: incidentGID, note, occurredAt };
  if (tagNames?.length) input.timelineEventTagNames = tagNames;

  const data = await defaultClient.graphql<{
    timelineEventCreate: { timelineEvent: WorkItemRaw; errors: string[] };
  }>(
    `mutation CreateTimelineEvent($input: TimelineEventCreateInput!) {
      timelineEventCreate(input: $input) {
        timelineEvent { id note noteHtml action occurredAt createdAt timelineEventTags { nodes { id name } } }
        errors
      }
    }`,
    { input },
  );

  if (data.timelineEventCreate.errors?.length > 0) {
    throw new Error(
      `Failed to create timeline event: ${data.timelineEventCreate.errors.join(", ")}`,
    );
  }

  const e = data.timelineEventCreate.timelineEvent;
  const result: Record<string, unknown> = {
    id: e.id,
    note: e.note,
    action: e.action,
    occurredAt: e.occurredAt,
    createdAt: e.createdAt,
  };
  if (e.noteHtml) result.noteHtml = e.noteHtml;
  const tags = (e.timelineEventTags?.nodes || []).map((t: WorkItemRaw) => t.name);
  if (tags.length > 0) result.tags = tags;
  return result;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function registerWorkItemTools(
  server: McpServer,
  logger: Logger,
): Map<string, RegisteredTool> {
  logger.debug("Registering work item tools");
  const tools = new Map<string, RegisteredTool>();

  // get_work_item
  const t1 = server.registerTool(
    "get_work_item",
    {
      title: "Get Work Item",
      description:
        "Get a single work item with full details including status, hierarchy (parent/children), type, labels, assignees, and all widgets.",
      inputSchema: {
        project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
        iid: z.coerce.number().describe("The internal ID (IID) of the work item"),
      },
    },
    async (params) => {
      const args = GetWorkItemSchema.parse(params);
      return jsonResponse(await getWorkItem(args.project_id, args.iid));
    },
  );
  t1.disable();
  tools.set("get_work_item", t1);

  // list_work_items
  const t2 = server.registerTool(
    "list_work_items",
    {
      title: "List Work Items",
      description:
        "List work items in a project with filters (type, state, search, assignees, labels). Returns items with status and hierarchy info.",
      inputSchema: {
        project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
        types: z.array(workItemTypeEnum).optional().describe("Filter by work item types"),
        state: z.enum(["opened", "closed"]).optional().describe("Filter by state"),
        search: z.string().optional().describe("Search in title and description"),
        assignee_usernames: z.array(z.string()).optional().describe("Filter by assignee usernames"),
        label_names: z.array(z.string()).optional().describe("Filter by label names"),
        first: z.coerce
          .number()
          .optional()
          .default(20)
          .describe("Number of items to return (max 100)"),
        after: z.string().optional().describe("Cursor for pagination"),
      },
    },
    async (params) => {
      const args = ListWorkItemsSchema.parse(params);
      const { project_id, ...opts } = args;
      return jsonResponse(await listWorkItems(project_id, opts));
    },
  );
  t2.disable();
  tools.set("list_work_items", t2);

  // create_work_item
  const t3 = server.registerTool(
    "create_work_item",
    {
      title: "Create Work Item",
      description:
        "Create a new work item (issue, task, incident, test_case, epic, key_result, objective, requirement, ticket). Supports setting title, description, labels, assignees, weight, parent, health status, start/due dates, milestone, and confidentiality.",
      inputSchema: {
        project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
        title: z.string().describe("Title of the work item"),
        type: workItemTypeEnum.optional().default("issue").describe("Type of work item"),
        description: z.string().optional().describe("Description (Markdown supported)"),
        labels: z.array(z.string()).optional().describe("Label names to assign"),
        assignee_usernames: z.array(z.string()).optional().describe("Usernames to assign"),
        parent_iid: z.coerce.number().optional().describe("IID of parent work item"),
        weight: z.coerce.number().optional().describe("Weight"),
        health_status: z
          .enum(["onTrack", "needsAttention", "atRisk"])
          .optional()
          .describe("Health status"),
        start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
        due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
        milestone_id: z.string().optional().describe("Milestone ID"),
        iteration_id: z.string().optional().describe("Iteration ID"),
        confidential: z.coerce.boolean().optional().describe("Set confidentiality"),
      },
    },
    async (params) => {
      const args = CreateWorkItemSchema.parse(params);
      const { project_id, ...opts } = args;
      return jsonResponse(await createWorkItem(project_id, opts));
    },
  );
  t3.disable();
  tools.set("create_work_item", t3);

  // update_work_item
  const t4 = server.registerTool(
    "update_work_item",
    {
      title: "Update Work Item",
      description:
        "Update a work item. Can modify title, description, labels, assignees, weight, state, status, parent hierarchy, children, health status, start/due dates, milestone, confidentiality, linked items, and custom fields.",
      inputSchema: {
        project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
        iid: z.coerce.number().describe("The internal ID (IID) of the work item"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        add_labels: z.array(z.string()).optional().describe("Label names to add"),
        remove_labels: z.array(z.string()).optional().describe("Label names to remove"),
        assignee_usernames: z.array(z.string()).optional().describe("Set assignees by username"),
        state_event: z.enum(["close", "reopen"]).optional().describe("Close or reopen"),
        weight: z.coerce.number().optional().describe("Set weight"),
        status: z.string().optional().describe("Set status by ID"),
        parent_iid: z.coerce.number().optional().describe("Set parent by IID"),
        parent_project_id: z.coerce.string().optional().describe("Parent project ID"),
        remove_parent: z.coerce.boolean().optional().describe("Remove parent"),
        health_status: z
          .enum(["onTrack", "needsAttention", "atRisk"])
          .optional()
          .describe("Health status"),
        start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
        due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
        milestone_id: z.string().optional().describe("Milestone ID"),
        iteration_id: z.string().optional().describe("Iteration ID"),
        confidential: z.coerce.boolean().optional().describe("Confidentiality"),
        severity: z
          .enum(["UNKNOWN", "LOW", "MEDIUM", "HIGH", "CRITICAL"])
          .optional()
          .describe("Incident severity"),
        escalation_status: z
          .enum(["TRIGGERED", "ACKNOWLEDGED", "RESOLVED", "IGNORED"])
          .optional()
          .describe("Incident escalation status"),
      },
    },
    async (params) => {
      const args = UpdateWorkItemSchema.parse(params);
      const { project_id, iid: wiIid, ...opts } = args;
      return jsonResponse(await updateWorkItem(project_id, wiIid, opts));
    },
  );
  t4.disable();
  tools.set("update_work_item", t4);

  // convert_work_item_type
  const t5 = server.registerTool(
    "convert_work_item_type",
    {
      title: "Convert Work Item Type",
      description:
        "Convert a work item to a different type (e.g. issue to task, task to incident).",
      inputSchema: {
        project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
        iid: z.coerce.number().describe("The internal ID of the work item"),
        new_type: workItemTypeEnum.describe("The target work item type"),
      },
    },
    async (params) => {
      const args = ConvertWorkItemTypeSchema.parse(params);
      return jsonResponse(await convertWorkItemType(args.project_id, args.iid, args.new_type));
    },
  );
  t5.disable();
  tools.set("convert_work_item_type", t5);

  // list_work_item_statuses
  const t6 = server.registerTool(
    "list_work_item_statuses",
    {
      title: "List Work Item Statuses",
      description:
        "List available statuses for a work item type in a project. Requires GitLab Premium/Ultimate with configurable statuses.",
      inputSchema: {
        project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
        work_item_type: workItemTypeEnum.optional().default("issue").describe("Work item type"),
      },
    },
    async (params) => {
      const args = ListWorkItemStatusesSchema.parse(params);
      return jsonResponse(await listWorkItemStatuses(args.project_id, args.work_item_type));
    },
  );
  t6.disable();
  tools.set("list_work_item_statuses", t6);

  // list_custom_field_definitions
  const t7 = server.registerTool(
    "list_custom_field_definitions",
    {
      title: "List Custom Field Definitions",
      description:
        "List available custom field definitions for a work item type in a project. Returns field names, types, and IDs needed for setting custom fields via update_work_item.",
      inputSchema: {
        project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
        work_item_type: workItemTypeEnum.optional().default("issue").describe("Work item type"),
      },
    },
    async (params) => {
      const args = ListCustomFieldDefinitionsSchema.parse(params);
      return jsonResponse(await listCustomFieldDefinitions(args.project_id, args.work_item_type));
    },
  );
  t7.disable();
  tools.set("list_custom_field_definitions", t7);

  // move_work_item
  const t8 = server.registerTool(
    "move_work_item",
    {
      title: "Move Work Item",
      description:
        "Move a work item (issue, task, etc.) to a different project. Uses GitLab GraphQL issueMove mutation.",
      inputSchema: {
        project_id: z.coerce.string().describe("Source project ID or path"),
        iid: z.coerce.number().describe("The internal ID of the work item"),
        target_project_id: z.coerce.string().describe("Target project ID or path"),
      },
    },
    async (params) => {
      const args = MoveWorkItemSchema.parse(params);
      return jsonResponse(await moveWorkItem(args.project_id, args.iid, args.target_project_id));
    },
  );
  t8.disable();
  tools.set("move_work_item", t8);

  // list_work_item_notes
  const t9 = server.registerTool(
    "list_work_item_notes",
    {
      title: "List Work Item Notes",
      description:
        "List notes and discussions on a work item. Returns threaded discussions with author, body, timestamps, and system/internal flags.",
      inputSchema: {
        project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
        iid: z.coerce.number().describe("The internal ID of the work item"),
        page_size: z.coerce
          .number()
          .optional()
          .default(20)
          .describe("Number of discussions to return"),
        after: z.string().optional().describe("Cursor for pagination"),
        sort: z
          .enum(["CREATED_ASC", "CREATED_DESC"])
          .optional()
          .default("CREATED_ASC")
          .describe("Sort order"),
      },
    },
    async (params) => {
      const args = ListWorkItemNotesSchema.parse(params);
      return jsonResponse(
        await listWorkItemNotes(args.project_id, args.iid, {
          page_size: args.page_size,
          after: args.after,
          sort: args.sort,
        }),
      );
    },
  );
  t9.disable();
  tools.set("list_work_item_notes", t9);

  // create_work_item_note
  const t10 = server.registerTool(
    "create_work_item_note",
    {
      title: "Create Work Item Note",
      description:
        "Add a note/comment to a work item. Supports Markdown, internal notes, and threaded replies.",
      inputSchema: {
        project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
        iid: z.coerce.number().describe("The internal ID of the work item"),
        body: z.string().describe("Note body (Markdown supported)"),
        internal: z.coerce.boolean().optional().default(false).describe("Internal note"),
        discussion_id: z.string().optional().describe("Discussion ID for threaded reply"),
      },
    },
    async (params) => {
      const args = CreateWorkItemNoteSchema.parse(params);
      return jsonResponse(
        await createWorkItemNote(args.project_id, args.iid, args.body, {
          internal: args.internal,
          discussion_id: args.discussion_id,
        }),
      );
    },
  );
  t10.disable();
  tools.set("create_work_item_note", t10);

  // get_timeline_events
  const t11 = server.registerTool(
    "get_timeline_events",
    {
      title: "Get Timeline Events",
      description:
        "List timeline events for an incident. Returns chronological events with notes, timestamps, and tags.",
      inputSchema: {
        project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
        incident_iid: z.coerce.number().describe("The internal ID of the incident"),
      },
    },
    async (params) => {
      const args = GetTimelineEventsSchema.parse(params);
      return jsonResponse(await getTimelineEvents(args.project_id, args.incident_iid));
    },
  );
  t11.disable();
  tools.set("get_timeline_events", t11);

  // create_timeline_event
  const t12 = server.registerTool(
    "create_timeline_event",
    {
      title: "Create Timeline Event",
      description:
        "Create a timeline event on an incident. Supports tags: 'Start time', 'End time', 'Impact detected', 'Response initiated', 'Impact mitigated', 'Cause identified'.",
      inputSchema: {
        project_id: z.coerce.string().describe("Project ID or URL-encoded path"),
        incident_iid: z.coerce.number().describe("The internal ID of the incident"),
        note: z.string().describe("Description of the timeline event (Markdown supported)"),
        occurred_at: z.string().describe("When the event occurred (ISO 8601 format)"),
        tag_names: z
          .array(
            z.enum([
              "Start time",
              "End time",
              "Impact detected",
              "Response initiated",
              "Impact mitigated",
              "Cause identified",
            ]),
          )
          .optional()
          .describe("Timeline event tags"),
      },
    },
    async (params) => {
      const args = CreateTimelineEventSchema.parse(params);
      return jsonResponse(
        await createTimelineEvent(
          args.project_id,
          args.incident_iid,
          args.note,
          args.occurred_at,
          args.tag_names,
        ),
      );
    },
  );
  t12.disable();
  tools.set("create_timeline_event", t12);

  logger.debug("Work item tools registered", { count: tools.size });
  return tools;
}
