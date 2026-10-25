import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  MantineProvider,
  AppShell,
  Group,
  Stack,
  Text,
  Title,
  Button,
  TextInput,
  Textarea,
  Select,
  Paper,
  Badge,
  Menu,
  ActionIcon,
  Avatar,
  Divider,
  Tabs,
  Modal,
  Alert,
  Stepper,
  Switch,
  Accordion,
  Table,
  ScrollArea,
  Loader,
  Checkbox,
  NumberInput,
  Code,
  Anchor,
  MultiSelect,
  FileInput,
} from "@mantine/core";
import {
  IconArrowRight,
  IconArrowLeft,
  IconPlayerPlay,
  IconPlus,
  IconSearch,
  IconDots,
  IconUsers,
  IconStack2,
  IconPlug,
  IconSettings,
  IconChevronDown,
  IconCopy,
  IconTrash,
  IconPlayerPause,
  IconShare,
  IconCheck,
  IconArrowUpRight,
  IconDownload,
  IconFile,
  IconAlertCircle,
  IconBrowser,
  IconBolt,
  IconX,
  IconWorld,
  IconDatabase,
  IconCoin,
} from "@tabler/icons-react";
import "@mantine/core/styles.css";
import "./style.css";
import {
  workflowSchema,
  actions,
  type Agent,
  type Workflow,
  type RelayBridge,
  type Request,
  type Run,
  type Step,
} from "../../shared-runtime/schema";
declare global {
  interface Window {
    relay: RelayBridge;
  }
}
const api = (
  method: Request["method"],
  payload: Record<string, unknown> = {},
) => window.relay.request({ method, payload });
const download = (file: { name: string; base64: string }) => {
  const blob = new Blob([
    Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0)),
  ]);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
const color = (s: string) =>
  s === "Completed" || s === "Ready" || s === "Connected"
    ? "teal"
    : s === "Needs input" || s === "Draft"
      ? "orange"
      : s === "Failed"
        ? "red"
        : "gray";
function App() {
  const [data, setData] = useState<any>();
  const [page, setPage] = useState("My agents");
  const [selected, setSelected] = useState<string>();
  const [wizard, setWizard] = useState<Agent | null>();
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [adminPage, setAdminPage] = useState("Teams");
  const [adminVisit, setAdminVisit] = useState(0);
  const [busy, setBusy] = useState(false);
  const [runAgent, setRunAgent] = useState<Agent>();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<Agent>();
  const identityEpoch = useRef(0);
  async function refresh() {
    const epoch = identityEpoch.current;
    const next = await api("snapshot");
    if (epoch === identityEpoch.current) setData(next);
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => refresh().catch(() => {}), 1500);
    return () => clearInterval(timer);
  }, []);
  async function act(fn: () => Promise<any>) {
    setBusy(true);
    setError("");
    try {
      const value = await fn();
      await refresh();
      return value;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const openRun = (a: Agent) => {
    setInputs({});
    setRunAgent(a);
  };
  const agent = data?.agents.find((a: Agent) => a.id === selected);
  const nav = (p: string) => {
    setPage(p);
    setSelected(undefined);
    setWizard(undefined);
    setSearch("");
  };
  if (!data)
    return (
      <div className="loading">
        <Loader />
        <Text>Opening Relay…</Text>
        {error && <Alert color="red">{error}</Alert>}
      </div>
    );
  return (
    <AppShell navbar={{ width: 236, breakpoint: "sm" }} padding={0}>
      <AppShell.Navbar p="lg" bg="white">
        <Group gap={10} mb={48} mt={8}>
          <div className="logo">
            <IconBolt size={25} />
          </div>
          <Text fw={750} size="25px" lts={-1}>
            Relay
          </Text>
        </Group>
        <Stack gap={6}>
          {admin && (
            <Text size="xs" c="teal" fw={700} tt="uppercase" px={12} mb={4}>
              Admin
            </Text>
          )}
          {(admin
            ? [
                ["Teams", IconUsers],
                ["Approved websites", IconWorld],
                ["Data", IconDatabase],
              ]
            : [
                ["My agents", IconStack2],
                ["Team agents", IconUsers],
                ["Connections", IconPlug],
              ]
          ).map(([label, Icon]: any) => (
            <button
              key={label}
              className={`nav ${(admin ? adminPage : page) === label ? "active" : ""}`}
              onClick={() => {
                if (!admin) return nav(label);
                setAdminPage(label);
                setAdminVisit((n) => n + 1);
              }}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </Stack>
        <div className="sidebar-bottom">
          <button className="nav" onClick={() => setSettings(true)}>
            <IconSettings size={19} />
            Application settings
          </button>
          <Divider my="md" />
          <Menu position="top-start" width={245}>
            <Menu.Target>
              <button className="profile">
                <Avatar color="teal" radius="xl">
                  {data.employee.initials}
                </Avatar>
                <div>
                  <Text size="sm" fw={600}>
                    {data.employee.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Northstar · Demo
                  </Text>
                </div>
                <IconChevronDown size={16} />
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>
                Demo identity switching · not secure authentication
              </Menu.Label>
              {data.employees.map((e: any) => (
                <Menu.Item
                  key={e.id}
                  onClick={() =>
                    act(async () => {
                      identityEpoch.current++;
                      setData(undefined);
                      await window.relay.switchEmployee(e.id);
                      setSelected(undefined);
                      setWizard(undefined);
                      setRunAgent(undefined);
                      setSettings(false);
                      setAdmin(false);
                      setError("");
                    })
                  }
                >
                  {e.name} · {e.team}
                  {e.role === "admin" && " · Admin"}
                </Menu.Item>
              ))}
              {data.employee.role === "admin" && (
                <>
                  <Menu.Divider />
                  <Menu.Item onClick={() => setAdmin(false)}>Employee</Menu.Item>
                  <Menu.Item
                    onClick={() => {
                      setAdmin(true);
                      setAdminPage("Teams");
                      setError("");
                    }}
                  >
                    Admin
                  </Menu.Item>
                </>
              )}
            </Menu.Dropdown>
          </Menu>
        </div>
      </AppShell.Navbar>
      <AppShell.Main>
        <div className="topbar">
          <Text size="sm" c="dimmed">
            Northstar Supply <span className="slash">/</span>{" "}
            {admin ? "Admin" : data.employee.team}
          </Text>
          <Badge variant="light" color="gray">
            Demo workspace
          </Badge>
        </div>
        <main className="content">
          {error && (
            <Alert
              mb="lg"
              color="red"
              title="Something needs attention"
              withCloseButton
              onClose={() => setError("")}
            >
              {error}
            </Alert>
          )}
          {admin && data.employee.role === "admin" ? (
            <Admin
              key={adminVisit}
              page={adminPage}
              setPage={setAdminPage}
              data={data}
              act={act}
            />
          ) : wizard !== undefined ? (
            <Wizard
              initial={wizard}
              data={data}
              close={() => setWizard(undefined)}
              changed={refresh}
              fail={setError}
            />
          ) : agent ? (
            <Detail
              agent={agent}
              data={data}
              act={act}
              run={() => openRun(agent)}
              back={() => setSelected(undefined)}
              edit={() => setWizard(agent)}
            />
          ) : page === "Connections" ? (
            <Connections data={data} act={act} />
          ) : (
            <>
              <Group justify="space-between" mb={30}>
                <div>
                  <Title order={1}>{page}</Title>
                  <Text c="dimmed" mt={6}>
                    {page === "My agents"
                      ? "Your everyday work, a little easier."
                      : "Useful workflows, shared by your team."}
                  </Text>
                </div>
                {page === "My agents" && (
                  <Button
                    leftSection={<IconPlus size={18} />}
                    size="md"
                    onClick={() => setWizard(null)}
                  >
                    Create agent
                  </Button>
                )}
              </Group>
              <TextInput
                className="search"
                mb={24}
                placeholder="Search agents"
                aria-label="Search agents"
                leftSection={<IconSearch size={18} />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Paper withBorder radius="lg" className="agent-list">
                {data.agents
                  .filter(
                    (a: Agent) =>
                      (page === "My agents"
                        ? a.owner === data.employee.id
                        : a.shared && a.team === data.employee.team) &&
                      `${a.name} ${a.description}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((a: Agent) => (
                    <div className="agent-row" key={a.id}>
                      <div className="agent-icon">
                        <IconBrowser size={24} />
                      </div>
                      <button
                        className="agent-title"
                        onClick={() => setSelected(a.id)}
                      >
                        <Text fw={650}>{a.name}</Text>
                        <Text size="sm" c="dimmed" mt={4}>
                          {a.description}
                        </Text>
                      </button>
                      <Badge variant="light" color={color(a.status)}>
                        {a.status}
                      </Badge>
                      <Button
                        variant="light"
                        leftSection={<IconPlayerPlay size={15} />}
                        disabled={a.status !== "Ready"}
                        onClick={() => openRun(a)}
                      >
                        Run
                      </Button>
                      <Menu position="bottom-end">
                        <Menu.Target>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label={`More actions for ${a.name}`}
                          >
                            <IconDots />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item onClick={() => setSelected(a.id)}>
                            View agent
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconCopy size={16} />}
                            onClick={() =>
                              act(async () => {
                                const copy = await api("duplicate", {
                                  id: a.id,
                                });
                                setSelected(copy.id);
                                setPage("My agents");
                              })
                            }
                          >
                            Duplicate
                          </Menu.Item>
                          {a.owner === data.employee.id && (
                            <>
                              <Menu.Item onClick={() => setWizard(a)}>
                                Edit
                              </Menu.Item>
                              <Menu.Item
                                leftSection={<IconShare size={16} />}
                                onClick={() =>
                                  act(() =>
                                    api("saveAgent", {
                                      ...a,
                                      shared: !a.shared,
                                      untested: true,
                                    }),
                                  )
                                }
                              >
                                {a.shared ? "Stop sharing" : "Share with team"}
                              </Menu.Item>
                              <Menu.Item
                                leftSection={<IconPlayerPause size={16} />}
                                onClick={() =>
                                  act(() =>
                                    api("saveAgent", {
                                      ...a,
                                      status:
                                        a.status === "Paused"
                                          ? "Draft"
                                          : "Paused",
                                    }),
                                  )
                                }
                              >
                                {a.status === "Paused"
                                  ? "Return to draft"
                                  : "Pause"}
                              </Menu.Item>
                              <Menu.Item
                                color="red"
                                leftSection={<IconTrash size={16} />}
                                onClick={() => setDeleting(a)}
                              >
                                Delete
                              </Menu.Item>
                            </>
                          )}
                        </Menu.Dropdown>
                      </Menu>
                    </div>
                  ))}
                {!data.agents.some((a: Agent) =>
                  page === "My agents"
                    ? a.owner === data.employee.id
                    : a.shared && a.team === data.employee.team,
                ) && (
                  <div className="empty">
                    <IconStack2 size={36} />
                    <Title order={3}>
                      {page === "My agents"
                        ? "Make room for your best work"
                        : "Nothing shared yet"}
                    </Title>
                    <Text c="dimmed">
                      {page === "My agents"
                        ? "Start with a browser task you repeat."
                        : "Shared team agents will appear here."}
                    </Text>
                    {page === "My agents" && (
                      <Button onClick={() => setWizard(null)}>
                        Create your first agent
                      </Button>
                    )}
                  </div>
                )}
              </Paper>
              <Text size="xs" c="dimmed" mt={18}>
                Fixture agents use fictional data. Runs and results appear only
                after execution.
              </Text>
            </>
          )}
        </main>
      </AppShell.Main>
      <Modal
        opened={!!runAgent}
        onClose={() => setRunAgent(undefined)}
        title={`Run ${runAgent?.name}`}
        centered
      >
        <Stack>
          {runAgent?.workflow.inputs.map((i) => (
            <TextInput
              key={i.name}
              label={i.label}
              required={i.required}
              value={inputs[i.name] || ""}
              onChange={(e) =>
                setInputs({ ...inputs, [i.name]: e.target.value })
              }
            />
          ))}
          {runAgent &&
            data.readiness[runAgent.id]?.map((s: string) => (
              <Alert key={s} color="orange">
                {s}
              </Alert>
            ))}
          <Text size="sm" c="dimmed">
            Uses your own {runAgent?.location} connections.
          </Text>
          <Button
            loading={busy}
            onClick={() =>
              act(async () => {
                await api("run", { id: runAgent!.id, inputs });
                setSelected(runAgent!.id);
                setRunAgent(undefined);
              })
            }
          >
            Start run
          </Button>
        </Stack>
      </Modal>
      <Modal
        opened={!!deleting}
        onClose={() => setDeleting(undefined)}
        title="Delete this agent?"
        centered
      >
        <Text mb="lg">
          This removes “{deleting?.name}”. Existing run history remains private
          to its owner.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setDeleting(undefined)}>
            Keep agent
          </Button>
          <Button
            color="red"
            onClick={() =>
              act(async () => {
                await api("deleteAgent", { id: deleting!.id });
                setDeleting(undefined);
              })
            }
          >
            Delete agent
          </Button>
        </Group>
      </Modal>
      <Settings
        key={data.employee.id}
        opened={settings}
        close={() => setSettings(false)}
        data={data}
        act={act}
      />
    </AppShell>
  );
}
function Connections({ data, act }: any) {
  const [url, setUrl] = useState("");
  const [location, setLocation] = useState("local");
  return (
    <>
      <Group justify="space-between" mb={30}>
        <div>
          <Title order={1}>Connections</Title>
          <Text c="dimmed" mt={6}>
            Your accounts. Only used by agents you run.
          </Text>
        </div>
        <Select
          aria-label="Execution location"
          value={location}
          onChange={(v) => setLocation(v!)}
          data={[
            { value: "local", label: "On this computer" },
            { value: "hosted", label: "Hosted" },
          ]}
        />
      </Group>
      <Stack>
        {!data.allowedSites.length && (
          <Empty
            title="No websites approved yet"
            text="Your admin chooses which websites your team can connect accounts to."
          />
        )}
        {data.sites.map((site: any) => {
          const c = data.connections.find(
            (c: any) => c.site === site.id && c.location === location,
          );
          const approved = data.allowedSites.includes(site.id);
          if (!approved && !c) return null;
          return (
            <Paper withBorder p="xl" radius="lg" key={site.id}>
              <Group justify="space-between">
                <Group>
                  <div className="agent-icon">
                    <IconPlug />
                  </div>
                  <div>
                    <Text fw={600}>{site.name}</Text>
                    <Text size="sm" c="dimmed">
                      {new URL(site.origin).host} · {location}
                    </Text>
                  </div>
                </Group>
                <Badge color={!approved ? "gray" : c ? "teal" : "orange"}>
                  {!approved
                    ? "No longer approved"
                    : c?.status || "Needs connection"}
                </Badge>
              </Group>
              <Divider my="lg" />
              <Group justify="space-between">
                <div>
                  <Text size="sm">
                    {c?.account || "Sign in directly in a dedicated browser."}
                  </Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    {approved
                      ? "Available to your runs that require this website."
                      : "Your admin removed this website for your team. Agents can’t use it."}
                  </Text>
                </div>
                {c ? (
                  <Button
                    variant="default"
                    onClick={() =>
                      act(() => api("disconnect", { site: site.id, location }))
                    }
                  >
                    Disconnect
                  </Button>
                ) : site.type === "api" ? (
                  <ApiConnection site={site} location={location} act={act} />
                ) : data.signingSites?.includes(`${data.employee.id}:${location}:${site.id}`) ? (
                  <Button
                    onClick={() =>
                      act(async () => {
                        await api("finishConnect", { site: site.id });
                      })
                    }
                  >
                    I’ve finished signing in
                  </Button>
                ) : (
                  <Button
                    variant="light"
                    onClick={() =>
                      act(async () => {
                        await api("connect", { site: site.id, location });
                      })
                    }
                  >
                    Connect account
                  </Button>
                )}
              </Group>
              {location === "hosted" && (
                <Text size="sm" mt="md" c="dimmed">
                  On the hosted worker, run npm run seed -- connect{" "}
                  {data.employee.id} to open its login browser.
                </Text>
              )}
            </Paper>
          );
        })}
        <Paper withBorder p="xl" radius="lg">
          <Title order={3}>Need another website?</Title>
          <Group align="flex-end" mt="md">
            <TextInput
              style={{ flex: 1 }}
              label="Website"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button
              variant="default"
              onClick={() =>
                act(async () => {
                  await api("requestSite", { url });
                  setUrl("");
                })
              }
            >
              Request website
            </Button>
          </Group>
          {data.requests.map((r: any) => (
            <Group mt="md" key={r.id}>
              <Text size="sm">{r.origin}</Text>
              <Badge color="gray">Pending</Badge>
            </Group>
          ))}
        </Paper>
        <Text size="xs" c="dimmed">
          Disconnect removes Relay’s retained browser session. It does not
          revoke access at the website itself.
        </Text>
      </Stack>
    </>
  );
}
function ApiConnection({ site, location, act }: any) {
  const credential = useRef<HTMLInputElement>(null);
  return (
    <Group align="flex-end">
      <TextInput
        ref={credential}
        type="password"
        label={site.auth === "bearer" ? "Bearer token" : "API key"}
        autoComplete="off"
      />
      <Button
        onClick={() =>
          act(async () => {
            await api("connect", {
              site: site.id,
              location,
              credential: credential.current?.value,
            });
            if (credential.current) credential.current.value = "";
          })
        }
      >
        Connect
      </Button>
    </Group>
  );
}
function BackendConnection({ agent, data, act }: any) {
  const [endpoint, setEndpoint] = useState(
    data.backends?.find((b: any) => b.agentId === agent.id)?.endpoint ||
      "http://127.0.0.1:4320",
  );
  const token = useRef<HTMLInputElement>(null);
  return (
    <Stack>
      <Text size="sm">
        On the backend, provision this agent for your demo employee, then paste
        the generated token.
      </Text>
      <Code block>
        npm run seed -- provision {data.employee.id} {agent.id}
      </Code>
      <TextInput
        label="Backend URL"
        value={endpoint}
        onChange={(e) => setEndpoint(e.target.value)}
      />
      <TextInput
        label="Backend integration token"
        type="password"
        ref={token}
        autoComplete="off"
      />
      <Button
        variant="light"
        onClick={() =>
          act(async () => {
            await api("backend", {
              id: agent.id,
              endpoint,
              token: token.current?.value,
            });
            if (token.current) token.current.value = "";
          })
        }
      >
        Connect hosted backend
      </Button>
      <Text size="xs" c="dimmed">
        Hosted results stay on the backend and are retrieved with this scoped
        token. Browser sessions are never transferred.
      </Text>
    </Stack>
  );
}
function Detail({ agent: a, data, act, run, back, edit }: any) {
  const [tab, setTab] = useState<string | null>("activity");
  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<any>();
  const mine = a.owner === data.employee.id;
  const runs = data.runs.filter((r: Run) => r.agentId === a.id);
  useEffect(() => {
    if (tab === "results")
      api("results", { id: a.id }).then((r) => setRows(r.rows));
  }, [
    tab,
    a.id,
    data.runs.length,
    JSON.stringify(runs.map((r: Run) => r.state)),
  ]);
  const files = data.artifacts.filter((f: any) =>
    runs.some((r: Run) => r.id === f.runId),
  );
  const keys = [...new Set<string>(rows.flatMap((r) => Object.keys(r.data)))];
  return (
    <>
      <Button
        variant="subtle"
        color="gray"
        leftSection={<IconArrowLeft size={16} />}
        onClick={back}
        px={0}
        mb="lg"
      >
        Back to agents
      </Button>
      <Group justify="space-between" align="flex-start" mb="xl">
        <div>
          <Group>
            <Title order={1}>{a.name}</Title>
            <Badge color={color(a.status)}>{a.status}</Badge>
          </Group>
          <Text c="dimmed" mt={7}>
            {a.description}
          </Text>
        </div>
        <Button
          leftSection={<IconPlayerPlay size={17} />}
          onClick={run}
          disabled={a.status !== "Ready"}
        >
          Run agent
        </Button>
      </Group>
      <Tabs value={tab} onChange={setTab}>
        <Tabs.List mb="xl">
          <Tabs.Tab value="activity">Activity</Tabs.Tab>
          <Tabs.Tab value="results">Results</Tabs.Tab>
          <Tabs.Tab value="edit">Edit</Tabs.Tab>
          <Tabs.Tab value="settings">Settings</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="activity">
          <Stack>
            {!runs.length && (
              <Empty
                title="Ready when you are"
                text="Run this agent to see progress and activity here."
              />
            )}
            {runs
              .slice()
              .reverse()
              .map((r: Run) => (
                <Paper withBorder p="lg" radius="md" key={r.id}>
                  <Group justify="space-between">
                    <div>
                      <Text fw={600}>
                        {new Date(r.created).toLocaleString()}
                      </Text>
                      <Text size="sm" c="dimmed" mt={5}>
                        Step {Math.min(r.step + 1, r.workflow.steps.length)} of{" "}
                        {r.workflow.steps.length} ·{" "}
                        {r.workflow.steps[r.step]?.title || "Finished"}
                      </Text>
                    </div>
                    <Badge color={color(r.state)}>{r.state}</Badge>
                  </Group>
                  {r.error && (
                    <Alert mt="md" color="orange">
                      {r.error}
                    </Alert>
                  )}
                  <Group mt="md">
                    {r.state === "Needs input" && (
                      <Button
                        size="xs"
                        onClick={() => act(() => api("resume", { id: r.id }))}
                      >
                        Review complete · Resume
                      </Button>
                    )}
                    {[
                      "Queued",
                      "Running",
                      "Needs input",
                      "Waiting for runner",
                    ].includes(r.state) && (
                      <Button
                        size="xs"
                        variant="default"
                        onClick={() => act(() => api("cancel", { id: r.id }))}
                      >
                        Stop run
                      </Button>
                    )}
                    {["Failed", "Cancelled"].includes(r.state) && (
                      <Button size="xs" variant="light" onClick={run}>
                        Retry as new run
                      </Button>
                    )}
                  </Group>
                  <Accordion mt="sm" variant="default">
                    <Accordion.Item value="detail">
                      <Accordion.Control>Technical detail</Accordion.Control>
                      <Accordion.Panel>
                        <Code block>
                          {JSON.stringify(
                            {
                              runId: r.id,
                              version: r.version,
                              history: r.history,
                            },
                            null,
                            2,
                          )}
                        </Code>
                      </Accordion.Panel>
                    </Accordion.Item>
                  </Accordion>
                </Paper>
              ))}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="results">
          <Group justify="space-between" mb="lg">
            <TextInput
              placeholder="Search results"
              aria-label="Search results"
              leftSection={<IconSearch size={17} />}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Group>
              <Button
                variant="default"
                size="sm"
                leftSection={<IconDownload size={16} />}
                onClick={() =>
                  act(async () =>
                    download(await api("export", { id: a.id, format: "csv" })),
                  )
                }
              >
                CSV
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() =>
                  act(async () =>
                    download(await api("export", { id: a.id, format: "xlsx" })),
                  )
                }
              >
                Excel
              </Button>
            </Group>
          </Group>
          {!rows.length && !files.length ? (
            <Empty
              title="Useful work lands here"
              text="Collected records, reports, and files will appear after a completed run."
            />
          ) : (
            <Stack>
              {a.workflow.output.format === "report" &&
                rows
                  .filter((r) =>
                    JSON.stringify(r.data)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((r) => (
                    <Paper key={r.id} withBorder p="xl" radius="md">
                      <Text size="xs" c="dimmed" mb="md">
                        {new Date(r.collectedAt).toLocaleString()} · Run{" "}
                        {r.runId.slice(0, 8)}
                      </Text>
                      {Object.entries(r.data).map(([key, value]) => (
                        <div key={key}>
                          <Text fw={600} mb={6}>
                            {key}
                          </Text>
                          <Text style={{ whiteSpace: "pre-wrap" }} mb="md">
                            {typeof value === "string"
                              ? value
                              : JSON.stringify(value, null, 2)}
                          </Text>
                        </div>
                      ))}
                      {r.source && (
                        <Anchor
                          component="button"
                          size="sm"
                          onClick={() =>
                            act(() => api("openSource", { url: r.source }))
                          }
                        >
                          View source
                        </Anchor>
                      )}
                    </Paper>
                  ))}
              {rows.length > 0 && a.workflow.output.format !== "report" && (
                <Paper withBorder radius="md">
                  <ScrollArea>
                    <Table striped highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          {keys.map((k) => (
                            <Table.Th key={k}>{k}</Table.Th>
                          ))}
                          <Table.Th>Source</Table.Th>
                          <Table.Th>Collected</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {rows
                          .filter((r) =>
                            JSON.stringify(r.data)
                              .toLowerCase()
                              .includes(query.toLowerCase()),
                          )
                          .map((r) => (
                            <Table.Tr key={r.id}>
                              {keys.map((k) => (
                                <Table.Td key={k}>
                                  {typeof r.data[k] === "object"
                                    ? JSON.stringify(r.data[k])
                                    : String(r.data[k] ?? "")}
                                </Table.Td>
                              ))}
                              <Table.Td>
                                <Anchor
                                  size="xs"
                                  component="button"
                                  onClick={() =>
                                    act(() =>
                                      api("openSource", { url: r.source }),
                                    )
                                  }
                                >
                                  {r.source}
                                </Anchor>
                                <Text size="xs" c="dimmed">
                                  Run {r.runId.slice(0, 8)}
                                </Text>
                              </Table.Td>
                              <Table.Td>
                                {new Date(r.collectedAt).toLocaleString()}
                              </Table.Td>
                            </Table.Tr>
                          ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Paper>
              )}
              {files.map((f: any) => (
                <Paper withBorder p="md" key={f.id}>
                  <Group justify="space-between">
                    <Group>
                      <IconFile color="#167d8d" />
                      <div>
                        <Text fw={500}>{f.name}</Text>
                        <Text size="xs" c="dimmed">
                          Run {f.runId.slice(0, 8)}
                        </Text>
                      </div>
                    </Group>
                    <Group>
                      <Button
                        size="xs"
                        variant="default"
                        onClick={() =>
                          act(async () =>
                            setPreview(
                              await api("artifact", {
                                id: f.id,
                                preview: true,
                              }),
                            ),
                          )
                        }
                      >
                        Preview
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconDownload size={15} />}
                        onClick={() =>
                          act(async () =>
                            download(await api("artifact", { id: f.id })),
                          )
                        }
                      >
                        Download
                      </Button>
                    </Group>
                  </Group>
                </Paper>
              ))}
            </Stack>
          )}
          <Text size="xs" c="dimmed" mt="lg">
            Only your results are shown. Sharing an agent never shares its
            historical results.
          </Text>
        </Tabs.Panel>
        <Tabs.Panel value="edit">
          <Group justify="space-between" mb="lg">
            <Title order={3}>Workflow</Title>
            {mine ? (
              <Button variant="light" onClick={edit}>
                Edit workflow
              </Button>
            ) : (
              <Button
                variant="light"
                onClick={() => act(() => api("duplicate", { id: a.id }))}
              >
                Duplicate to edit
              </Button>
            )}
          </Group>
          <Steps steps={a.workflow.steps} />
        </Tabs.Panel>
        <Tabs.Panel value="settings">
          <Stack>
            <Paper p="xl" withBorder>
              <Title order={3}>Agent preferences</Title>
              <Text mt="md">
                {a.location === "local"
                  ? "Runs on this computer"
                  : "Runs on a hosted worker"}
              </Text>
              <Text size="sm" c="dimmed">
                {a.intervalMinutes
                  ? `Scheduled every ${a.intervalMinutes} minutes`
                  : "Manual trigger"}
              </Text>
              {mine && (
                <Group mt="lg">
                  <Button variant="default" onClick={edit}>
                    Edit settings
                  </Button>
                  <Button
                    variant="light"
                    onClick={() =>
                      act(() =>
                        api("saveAgent", {
                          ...a,
                          shared: !a.shared,
                          untested: true,
                        }),
                      )
                    }
                  >
                    {a.shared ? "Stop team sharing" : "Share with team"}
                  </Button>
                  <Button
                    variant="default"
                    onClick={() =>
                      act(() => api("saveAgent", { ...a, status: "Paused" }))
                    }
                  >
                    Pause agent
                  </Button>
                </Group>
              )}
            </Paper>
            {mine && (
              <Accordion variant="separated">
                <Accordion.Item value="api">
                  <Accordion.Control>
                    Integrations · API access
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack>
                      <BackendConnection agent={a} data={data} act={act} />
                      <Divider />
                      <Text size="sm">
                        Tokens are scoped to this agent and your identity. Store
                        the token now; it is shown once.
                      </Text>
                      <Button
                        variant="light"
                        onClick={() =>
                          act(async () => {
                            const r = await api("token", { agentId: a.id });
                            setToken(r.token);
                          })
                        }
                      >
                        Create integration token
                      </Button>
                      {token && <Code block>{token}</Code>}
                      <Button
                        variant="default"
                        leftSection={<IconCopy size={16} />}
                        onClick={() =>
                          navigator.clipboard.writeText(
                            `curl -X POST http://127.0.0.1:4320/agents/${a.id}/runs -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" -H "Idempotency-Key: unique-request-id" -d '{"inputs":{}}'`,
                          )
                        }
                      >
                        Copy API example
                      </Button>
                      {data.tokens
                        .filter((t: any) => t.agentId === a.id)
                        .map((t: any) => (
                          <Group key={t.id} justify="space-between">
                            <Text size="sm">
                              {t.name} ·{" "}
                              {new Date(t.created).toLocaleDateString()}
                            </Text>
                            <Button
                              size="xs"
                              color="red"
                              variant="subtle"
                              onClick={() =>
                                act(() => api("revokeToken", { id: t.id }))
                              }
                            >
                              Revoke
                            </Button>
                          </Group>
                        ))}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
      <Modal
        opened={!!preview}
        onClose={() => setPreview(undefined)}
        title={preview?.name}
        size="xl"
      >
        <Stack>
          {preview?.sheets.map((sheet: any) => (
            <div key={sheet.name}>
              <Title order={4} mb="md">
                {sheet.name}
              </Title>
              <ScrollArea>
                <Table striped>
                  <Table.Tbody>
                    {sheet.rows.map((row: any[], i: number) => (
                      <Table.Tr key={i}>
                        {row.map((cell, j) => (
                          <Table.Td key={j}>{String(cell ?? "")}</Table.Td>
                        ))}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </div>
          ))}
          <Text size="xs" c="dimmed">
            Preview shows the first 100 records per worksheet. Formulas are not
            recalculated.
          </Text>
        </Stack>
      </Modal>
    </>
  );
}
const plural = (n: number, word: string) =>
  `${n} ${n === 1 ? word : word.endsWith("y") ? `${word.slice(0, -1)}ies` : `${word}s`}`;
const toBase64 = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};
function Admin({ page, setPage, data, act }: any) {
  const [siteSaving, setSiteSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [state, setState] = useState<any>();
  const [team, setTeam] = useState<string>();
  const [moving, setMoving] = useState<{ member: any; team: string }>();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<any>();
  const [preview, setPreview] = useState<any>();
  const [modelView, setModelView] = useState<{
    collectionId?: string;
    modelId?: string;
  }>();
  const load = () => api("admin").then(value => { setState(value); setLoadError(""); });
  const change = (fn: () => Promise<any>) =>
    act(async () => {
      const value = await fn();
      await load();
      return value;
    });
  useEffect(() => {
    load().catch(() => setLoadError("Couldn’t load the admin workspace. Please retry."));
    setTeam(undefined);
    setModelView(undefined);
  }, [page]);
  const active = state?.models.some((m: any) =>
    ["Preparing", "Training", "Publishing"].includes(m.state),
  );
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => load().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [active]);
  if (!state)
    return (
      <div className="empty">
        {loadError ? <Alert color="red">{loadError}<Button mt="sm" onClick={() => load().catch(() => setLoadError("Couldn’t load the admin workspace. Please retry."))}>Retry</Button></Alert> : <Loader />}
      </div>
    );
  const name = (id: string) =>
    data.employees.find((e: any) => e.id === id)?.name || id;
  const teamOptions = state.teams.map((t: any) => ({
    value: t.id,
    label: t.name,
  }));
  const of = (id: string) => ({
    members: data.employees.filter((e: any) => e.team === id),
    agents: state.agents.filter((a: any) => a.team === id),
    sites: data.sites.filter((s: any) =>
      state.teams.find((t: any) => t.id === id)?.sites.includes(s.id),
    ),
    collections: state.collections.filter((c: any) => c.team === id),
  });
  const toggleSite = async (t: any, site: string, on: boolean) => {
    if (siteSaving) return;
    const approved = on ? [...t.sites, site] : t.sites.filter((s: string) => s !== site);
    setSiteSaving(true);
    setState((value: any) => ({ ...value, teams: value.teams.map((item: any) => item.id === t.id ? { ...item, sites: approved } : item) }));
    try { await change(() => api("setTeamSites", { team: t.id, sites: approved })); }
    finally { await load().catch(() => {}); setSiteSaving(false); }
  };
  const header = (title: string, text: string, action?: React.ReactNode) => (
    <Group justify="space-between" mb={30}>
      <div>
        <Title order={1}>{title}</Title>
        <Text c="dimmed" mt={6}>
          {text}
        </Text>
      </div>
      {action}
    </Group>
  );
  const selected = state.teams.find((t: any) => t.id === team);
  let body: React.ReactNode;
  if (page === "Teams" && selected) {
    const t = of(selected.id);
    body = (
      <>
        <Button
          variant="subtle"
          color="gray"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => setTeam(undefined)}
          px={0}
          mb="lg"
        >
          Back to teams
        </Button>
        {header(
          selected.name,
          `${plural(t.members.length, "member")} · ${plural(t.agents.length, "agent")} · ${plural(t.sites.length, "approved website")} · ${plural(t.collections.length, "data collection")}`,
        )}
        <Stack gap="xl">
          <Paper withBorder radius="lg" className="agent-list">
            <Group justify="space-between" px={24} pt={22}>
              <Title order={3}>Members</Title>
            </Group>
            {t.members.map((m: any) => (
              <div className="agent-row" key={m.id}>
                <Avatar color="teal" radius="xl">
                  {m.initials}
                </Avatar>
                <div style={{ flex: 1 }}>
                  <Text fw={650}>{m.name}</Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    {plural(
                      state.agents.filter((a: any) => a.owner === m.id).length,
                      "agent",
                    )}
                  </Text>
                </div>
                {m.role === "admin" && (
                  <Badge variant="light" color="gray">
                    Admin
                  </Badge>
                )}
                <Select
                  aria-label={`Team for ${m.name}`}
                  value={m.team}
                  data={teamOptions}
                  allowDeselect={false}
                  onChange={(v) =>
                    v && v !== m.team && setMoving({ member: m, team: v })
                  }
                />
              </div>
            ))}
            {!t.members.length && (
              <Text size="sm" c="dimmed" px={24} py={22}>
                No one is on this team.
              </Text>
            )}
          </Paper>
          <Paper withBorder radius="lg" className="agent-list">
            <Group justify="space-between" px={24} pt={22}>
              <Title order={3}>Agents</Title>
            </Group>
            {t.agents.map((a: any) => (
              <div className="agent-row" key={a.id}>
                <div className="agent-icon">
                  <IconBrowser size={24} />
                </div>
                <div style={{ flex: 1 }}>
                  <Text fw={650}>{a.name}</Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    Owned by {name(a.owner)} · {plural(a.steps, "step")}
                    {a.sites.length
                      ? ` · ${a.sites
                          .map(
                            (id: string) =>
                              data.sites.find((s: any) => s.id === id)?.name ||
                              id,
                          )
                          .join(", ")}`
                      : ""}
                  </Text>
                </div>
                <Badge variant="light" color={a.shared ? "teal" : "gray"}>
                  {a.shared ? "Shared with team" : "Private to owner"}
                </Badge>
                <Badge variant="light" color={color(a.status)}>
                  {a.status}
                </Badge>
              </div>
            ))}
            {!t.agents.length && (
              <Text size="sm" c="dimmed" px={24} py={22}>
                This team has no agents yet.
              </Text>
            )}
          </Paper>
          <Text size="xs" c="dimmed" mt={-12}>
            Only an agent’s owner can edit it. Teammates can run shared agents
            with their own connected accounts.
          </Text>
          <Paper withBorder p="xl" radius="lg">
            <Title order={3}>Approved websites</Title>
            <Text size="sm" c="dimmed" mt={4} mb="md">
              Members can connect accounts only to these websites.
            </Text>
            <Stack gap="sm">
              {data.sites.map((s: any) => (
                <Checkbox
                  key={s.id}
                  label={s.name}
                  description={new URL(s.origin).host}
                  checked={selected.sites.includes(s.id)}
                  disabled={siteSaving}
                  onChange={(e) =>
                    toggleSite(selected, s.id, e.currentTarget.checked)
                  }
                />
              ))}
            </Stack>
          </Paper>
          <Paper withBorder p="xl" radius="lg">
            <Group justify="space-between">
              <Title order={3}>Data collections</Title>
              <Button variant="default" onClick={() => setPage("Data")}>
                Manage data
              </Button>
            </Group>
            <Stack gap={6} mt="md">
              {t.collections.map((c: any) => (
                <Text size="sm" key={c.id}>
                  {c.name}{" "}
                  <Text span size="sm" c="dimmed">
                    · {c.fileName} · {plural(c.rows, "row")}
                  </Text>
                </Text>
              ))}
              {!t.collections.length && (
                <Text size="sm" c="dimmed">
                  No data collections are shared with this team.
                </Text>
              )}
            </Stack>
          </Paper>
        </Stack>
      </>
    );
  } else if (page === "Teams")
    body = (
      <>
        {header("Teams", "Who is on each team and what they can use.")}
        <Paper withBorder radius="lg" className="agent-list">
          {state.teams.map((team: any) => {
            const t = of(team.id);
            return (
              <div className="agent-row" key={team.id}>
                <div className="agent-icon">
                  <IconUsers size={24} />
                </div>
                <button
                  className="agent-title"
                  onClick={() => setTeam(team.id)}
                >
                  <Text fw={650}>{team.name}</Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    {plural(t.members.length, "member")} ·{" "}
                    {plural(t.agents.length, "agent")} ·{" "}
                    {plural(t.sites.length, "approved website")} ·{" "}
                    {plural(t.collections.length, "data collection")}
                  </Text>
                </button>
                <Button variant="light" onClick={() => setTeam(team.id)}>
                  View team
                </Button>
              </div>
            );
          })}
        </Paper>
      </>
    );
  else if (page === "Approved websites")
    body = (
      <>
        {header(
          "Approved websites",
          "Choose which websites each team can connect accounts to.",
        )}
        <Stack>
          {data.sites.map((s: any) => (
            <Paper withBorder p="xl" radius="lg" key={s.id}>
              <Group>
                <div className="agent-icon">
                  <IconWorld />
                </div>
                <div>
                  <Text fw={600}>{s.name}</Text>
                  <Text size="sm" c="dimmed">
                    {new URL(s.origin).host} ·{" "}
                    {s.type === "api" ? "API key or token" : "Browser sign-in"}
                  </Text>
                </div>
              </Group>
              <Divider my="lg" />
              <Text size="sm" fw={550} mb="sm">
                Available to
              </Text>
              <Group>
                {state.teams.map((t: any) => (
                  <Checkbox
                    key={t.id}
                    label={t.name}
                    checked={t.sites.includes(s.id)}
                    disabled={siteSaving}
                    onChange={(e) =>
                      toggleSite(t, s.id, e.currentTarget.checked)
                    }
                  />
                ))}
              </Group>
            </Paper>
          ))}
          <Text size="xs" c="dimmed">
            Removing a website stops that team’s agents from using it. Employees
            stay signed in on their own computer until they disconnect. Relay
            never shows admins employees’ passwords or sessions.
          </Text>
          <Paper withBorder p="xl" radius="lg">
            <Title order={3}>Requested by employees</Title>
            <Text size="sm" c="dimmed" mt={4}>
              Before a new website can be approved, the person who deploys Relay
              has to add its sign-in details to the website catalog.
            </Text>
            {state.requests.map((r: any) => (
              <Group mt="md" key={r.id}>
                <Text size="sm">{r.origin}</Text>
                <Text size="sm" c="dimmed">
                  {name(r.owner)}
                </Text>
                <Badge color="gray">{r.status}</Badge>
              </Group>
            ))}
            {!state.requests.length && (
              <Text size="sm" mt="md">
                No requests right now.
              </Text>
            )}
          </Paper>
        </Stack>
      </>
    );
  else if (page === "Data" && modelView)
    body = (
      <ModelPage
        key={modelView.modelId || modelView.collectionId}
        view={modelView}
        open={setModelView}
        state={state}
        data={data}
        act={act}
        change={change}
      />
    );
  else if (page === "Data")
    body = (
      <>
        {header(
          "Data",
          "Spreadsheets a team’s agents can use.",
          <Button
            leftSection={<IconPlus size={18} />}
            size="md"
            onClick={() => setAdding(true)}
          >
            Add collection
          </Button>,
        )}
        <Text size="sm" mb="lg">
          A data collection is a CSV or Excel file shared with one team. That
          team’s agents can upload it to a website or filter it in a spreadsheet
          step.
        </Text>
        {state.collections.length ? (
          <Paper withBorder radius="lg" className="agent-list">
            {state.collections.map((c: any) => (
              <div className="agent-row collection-row" key={c.id}>
                <div className="agent-icon">
                  <IconFile size={24} />
                </div>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <Text fw={650}>{c.name}</Text>
                  {c.description && (
                    <Text size="sm" mt={4}>
                      {c.description}
                    </Text>
                  )}
                  <Text size="sm" c="dimmed" mt={4} truncate>
                    {c.fileName} · {plural(c.rows, "row")} · Columns:{" "}
                    {c.columns.join(", ") || "none"}
                  </Text>
                </div>
                <Select
                  aria-label={`Team for ${c.name}`}
                  value={c.team}
                  data={teamOptions}
                  allowDeselect={false}
                  onChange={(v) =>
                    v &&
                    change(() =>
                      api("updateCollection", { id: c.id, team: v }),
                    )
                  }
                />
                <Button
                  variant="default"
                  onClick={() =>
                    act(async () =>
                      setPreview(await api("collection", { id: c.id })),
                    )
                  }
                >
                  Preview
                </Button>
                <Button
                  variant="light"
                  onClick={() => setModelView({ collectionId: c.id })}
                >
                  Create a model
                </Button>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => setRemoving(c)}
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </div>
            ))}
          </Paper>
        ) : (
          <Empty
            title="No data collections yet"
            text="Add a CSV or Excel file and choose the team that can use it."
          />
        )}
        {state.models.length > 0 && (
          <>
            <Title order={3} mt={36} mb="md">
              Models
            </Title>
            <Paper withBorder radius="lg" className="agent-list">
              {state.models.map((m: any) => (
                <div className="agent-row" key={m.id}>
                  <div className="agent-icon">
                    <IconBolt size={24} />
                  </div>
                  <button
                    className="agent-title"
                    onClick={() => setModelView({ modelId: m.id })}
                  >
                    <Text fw={650}>{m.name}</Text>
                    <Text size="sm" c="dimmed" mt={4}>
                      Picks a “{m.labelColumn}” from a “{m.textColumn}” ·{" "}
                      {m.team}
                    </Text>
                  </button>
                  <Badge variant="light" color={modelColor(m.state)}>
                    {m.state}
                  </Badge>
                </div>
              ))}
            </Paper>
          </>
        )}
        {state.provider.connected && (
          <Group mt="lg" gap="xs">
            <Text size="xs" c="dimmed">
              Hugging Face connected as {state.provider.account} · billed to{" "}
              {state.provider.namespace}
            </Text>
            <Anchor
              size="xs"
              component="button"
              onClick={() => change(() => api("disconnectProvider"))}
            >
              Disconnect
            </Anchor>
          </Group>
        )}
      </>
    );
  else
    body = (
      <>
        {header("Budget", "Spending limits for agents.")}
        <Paper withBorder radius="lg" className="empty">
          <div className="agent-icon">
            <IconCoin size={25} />
          </div>
          <Title order={3}>Budgets aren’t available yet</Title>
          <Text size="sm" c="dimmed" maw={520}>
            Relay doesn’t measure what agent runs cost yet, so there’s nothing a
            budget could limit. Agents currently run without a spending limit.
          </Text>
        </Paper>
      </>
    );
  return (
    <>
      {body}
      <Modal
        opened={!!moving}
        onClose={() => setMoving(undefined)}
        title={`Move ${moving?.member.name}?`}
        centered
      >
        <Text mb="sm">
          {moving?.member.name} will join{" "}
          {state.teams.find((t: any) => t.id === moving?.team)?.name}.
        </Text>
        <Text size="sm" c="dimmed" mb="lg">
          Their agents move with them, and shared agents become available to
          the new team. They keep their own connected accounts, but can only use
          websites and data approved for the new team.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setMoving(undefined)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              change(async () => {
                await api("moveMember", {
                  id: moving!.member.id,
                  team: moving!.team,
                });
                setMoving(undefined);
              })
            }
          >
            Move member
          </Button>
        </Group>
      </Modal>
      <Modal
        opened={!!removing}
        onClose={() => setRemoving(undefined)}
        title="Remove this data collection?"
        centered
      >
        <Text mb="lg">
          This deletes “{removing?.name}”. Agents that use it will need a
          different file before they can run.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setRemoving(undefined)}>
            Keep collection
          </Button>
          <Button
            color="red"
            onClick={() =>
              change(async () => {
                await api("removeCollection", { id: removing!.id });
                setRemoving(undefined);
              })
            }
          >
            Remove collection
          </Button>
        </Group>
      </Modal>
      <AddCollection
        opened={adding}
        close={() => setAdding(false)}
        teams={teamOptions}
        change={change}
      />
      <Modal
        opened={!!preview}
        onClose={() => setPreview(undefined)}
        title={preview?.name}
        size="xl"
      >
        <Stack>
          {preview?.sheets.map((sheet: any) => (
            <ScrollArea key={sheet.name}>
              <Table striped>
                <Table.Tbody>
                  {sheet.rows.map((row: any[], i: number) => (
                    <Table.Tr key={i}>
                      {row.map((cell, j) => (
                        <Table.Td key={j}>{String(cell ?? "")}</Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          ))}
          <Text size="xs" c="dimmed">
            Preview shows the first 100 rows.
          </Text>
        </Stack>
      </Modal>
    </>
  );
}
const modelColor = (s: string) =>
  s === "Published" || s === "Evaluated"
    ? "teal"
    : s === "Failed"
      ? "red"
      : s === "Cancelled"
        ? "gray"
        : "orange";
const usd = (n: number) =>
  `$${n < 1 ? n.toFixed(n < 0.01 ? 4 : 2) : n.toFixed(2)}`;
const percent = (n: number) => `${Math.round(n * 100)}%`;
function Fact({ label, children }: any) {
  return (
    <Group align="flex-start" wrap="nowrap" gap="lg">
      <Text size="sm" c="dimmed" w={150} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <div style={{ flex: 1 }}>{children}</div>
    </Group>
  );
}
function ModelPage({ view, open, state, data, act, change }: any) {
  const model = state.models.find((m: any) => m.id === view.modelId);
  const [stage, setStage] = useState(0);
  const [plan, setPlan] = useState<any>();
  const [columns, setColumns] = useState<{ text?: string; label?: string }>({});
  const [goal, setGoal] = useState("");
  const [recommended, setRecommended] = useState(false);
  const [name, setName] = useState("");
  const [flavor, setFlavor] = useState<string | null>(null);
  const [hosting, setHosting] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [namespace, setNamespace] = useState("");
  const [tryText, setTryText] = useState("");
  const [answer, setAnswer] = useState<any>();
  const [token, setToken] = useState("");
  const secret = useRef<HTMLInputElement>(null);
  const collectionId = model?.collectionId || view.collectionId;
  const textColumn = columns.text || plan?.textColumn;
  const labelColumn = columns.label || plan?.labelColumn;
  const autoGoal =
    textColumn && labelColumn
      ? `Sort each “${textColumn}” into a “${labelColumn}”`
      : "";
  const chosenGoal = recommended ? autoGoal : goal;
  useEffect(() => {
    if (model) return;
    const timer = setTimeout(
      () =>
        api("modelPlan", {
          collectionId,
          textColumn: columns.text,
          labelColumn: columns.label,
          goal: chosenGoal,
        })
          .then((p) => {
            setPlan(p);
            setFlavor((f) => f || p.training[0]?.flavor || null);
          })
          .catch(() => {}),
      300,
    );
    return () => clearTimeout(timer);
  }, [collectionId, columns.text, columns.label, chosenGoal, model?.id]);
  const active = model
    ? model.state === "Published"
      ? 5
      : ["Evaluated", "Publishing"].includes(model.state)
        ? 4
        : 3
    : stage;
  const training = plan?.training.find((t: any) => t.flavor === flavor);
  const host = state.costs.hosting.find(
    (h: any) => h.id === (hosting || state.costs.hosting[0]?.id),
  );
  const goalFits = recommended || plan?.goal?.fit === "classification";
  const options = (plan?.columns || []).map((c: string) => ({
    value: c,
    label: c,
  }));
  const back = (
    <Button
      variant="subtle"
      color="gray"
      leftSection={<IconArrowLeft size={16} />}
      onClick={() => open(undefined)}
      px={0}
      mb="lg"
    >
      Back to data
    </Button>
  );
  if (!model && !plan)
    return (
      <>
        {back}
        <div className="empty">
          <Loader />
          <Text c="dimmed">Reading the spreadsheet…</Text>
        </div>
      </>
    );
  const approval = (text: string) => (
    <Checkbox
      label={text}
      checked={approved}
      onChange={(e) => setApproved(e.currentTarget.checked)}
    />
  );
  const budgetNote = (
    <Text size="xs" c="dimmed">
      Hugging Face bills these charges to {state.provider.namespace || "the connected account"}.
      Relay doesn’t track or limit spending yet, so they aren’t counted against
      an admin budget.
    </Text>
  );
  return (
    <>
      {back}
      <Group justify="space-between" align="flex-start" mb="xl">
        <div>
          <Text size="xs" c="teal" fw={700} tt="uppercase" mb={6}>
            Create a model
          </Text>
          <Group>
            <Title order={1}>
              {model?.name || plan?.collection.name}
            </Title>
            {model && (
              <Badge variant="light" color={modelColor(model.state)}>
                {model.state}
              </Badge>
            )}
          </Group>
          <Text c="dimmed" mt={6}>
            {model
              ? model.goal
              : `${plan.collection.fileName} · ${plural(plan.collection.rows, "row")} · ${plan.collection.team}`}
          </Text>
        </div>
      </Group>
      <Stepper active={active} size="sm" mb={36}>
        {["Data", "Goal", "Plan", "Train", "Publish", "Use"].map((label) => (
          <Stepper.Step key={label} label={label} />
        ))}
      </Stepper>
      {!model && stage === 0 && (
        <Paper p={32} withBorder radius="lg">
          <Stack gap="lg">
            <div>
              <Title order={2}>Check the data</Title>
              <Text size="sm" c="dimmed" mt={6}>
                Relay can train one kind of model: it reads a piece of text and
                picks one category. Each row needs the text and its correct
                category.
              </Text>
            </div>
            <Group grow>
              <Select
                label="Text the model reads"
                data={options}
                value={textColumn || null}
                onChange={(v) => setColumns((c) => ({ ...c, text: v || "" }))}
              />
              <Select
                label="Correct category"
                data={options}
                value={labelColumn || null}
                onChange={(v) => setColumns((c) => ({ ...c, label: v || "" }))}
              />
            </Group>
            <Paper withBorder radius="md">
              <ScrollArea>
                <Table striped>
                  <Table.Thead>
                    <Table.Tr>
                      {plan.columns.map((c: string) => (
                        <Table.Th key={c}>{c}</Table.Th>
                      ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {plan.sample.map((row: any, i: number) => (
                      <Table.Tr key={i}>
                        {plan.columns.map((c: string) => (
                          <Table.Td key={c}>{row[c]}</Table.Td>
                        ))}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>
            {plan.check.ok ? (
              <Alert color="teal" title="This data fits text classification">
                <Text size="sm">
                  {plural(plan.counts.train + plan.counts.eval, "usable example")}{" "}
                  across {plural(plan.check.labels.length, "category")}:{" "}
                  {plan.check.labels
                    .map((l: any) => `${l.label} (${l.count})`)
                    .join(", ")}
                  .
                </Text>
                {(plan.check.ignored > 0 || plan.check.duplicates > 0) && (
                  <Text size="sm" mt={6}>
                    {plan.check.ignored > 0 &&
                      `${plural(plan.check.ignored, "blank row")} will be skipped. `}
                    {plan.check.duplicates > 0 &&
                      `${plural(plan.check.duplicates, "repeated text")} will be used once.`}
                  </Text>
                )}
              </Alert>
            ) : (
              <Alert color="orange" title="This data can’t be used yet">
                <Stack gap="sm">
                  {plan.check.problems.map((p: any) => (
                    <div key={p.issue}>
                      <Text size="sm" fw={600}>
                        {p.issue}
                      </Text>
                      <Text size="sm">{p.fix}</Text>
                    </div>
                  ))}
                </Stack>
              </Alert>
            )}
            <Group justify="flex-end">
              <Button disabled={!plan.check.ok} onClick={() => setStage(1)}>
                Continue
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}
      {!model && stage === 1 && (
        <Paper p={32} withBorder radius="lg">
          <Stack gap="lg">
            <Title order={2}>What should the model do?</Title>
            {plan.suggestion?.textColumn === textColumn &&
              plan.suggestion?.labelColumn === labelColumn && (
                <Paper withBorder p="lg" radius="md">
                  <Group justify="space-between" wrap="nowrap">
                    <div>
                      <Text fw={600}>Recommended: {autoGoal}</Text>
                      <Text size="sm" c="dimmed" mt={4}>
                        {plan.suggestion.reason}
                      </Text>
                    </div>
                    <Button
                      variant={recommended ? "filled" : "light"}
                      leftSection={recommended && <IconCheck size={16} />}
                      onClick={() => setRecommended(!recommended)}
                    >
                      {recommended ? "Chosen" : "Use this"}
                    </Button>
                  </Group>
                </Paper>
              )}
            <Textarea
              label="Or describe your goal"
              placeholder={`e.g. Send each new ${textColumn} to the right ${labelColumn}`}
              minRows={2}
              disabled={recommended}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
            {!recommended && goal.trim() && plan.goal && (
              <Alert
                color={plan.goal.fit === "classification" ? "teal" : "orange"}
              >
                {plan.goal.message}
              </Alert>
            )}
            <Group justify="space-between">
              <Button variant="default" onClick={() => setStage(0)}>
                Back
              </Button>
              <Button disabled={!goalFits} onClick={() => setStage(2)}>
                Review plan
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}
      {!model && stage === 2 && (
        <Paper p={32} withBorder radius="lg">
          <Stack gap="lg">
            <Title order={2}>Review the plan</Title>
            <TextInput
              label="Model name"
              placeholder={`${plan.collection.name} classifier`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Stack gap="sm">
              <Fact label="Goal">
                <Text size="sm">{chosenGoal}</Text>
              </Fact>
              <Fact label="Spreadsheet">
                <Text size="sm">
                  {plan.collection.fileName} · text from “{textColumn}”,
                  category from “{labelColumn}”
                </Text>
              </Fact>
              <Fact label="Base model">
                <Text size="sm">
                  {plan.baseModel} — open-source (Apache 2.0), trained on
                  English text
                </Text>
              </Fact>
              <Fact label="Accepts">
                <Text size="sm">
                  One piece of text, like a “{textColumn}”. About the first 100
                  words are used.
                </Text>
              </Fact>
              <Fact label="Returns">
                <Text size="sm">
                  One “{labelColumn}”:{" "}
                  {plan.check.labels.map((l: any) => l.label).join(", ")} —
                  with a confidence score
                </Text>
              </Fact>
              <Fact label="Preparation">
                <Text size="sm">
                  Relay skips blank rows and uses repeated texts once, then sets
                  aside {plan.counts.eval} examples (about 20% of each category)
                  for testing. The model learns from the other{" "}
                  {plan.counts.train} and is tested on examples it hasn’t seen.
                  How well it does is only known after testing.
                </Text>
              </Fact>
            </Stack>
            <Divider />
            {!state.provider.connected ? (
              <Paper withBorder p="lg" radius="md">
                <Title order={4}>Connect Hugging Face</Title>
                <Text size="sm" c="dimmed" mt={4} mb="md">
                  Relay trains and hosts models with your Hugging Face account.
                  Use a token with write access. It’s kept in this computer’s
                  secure storage and never shown again.
                </Text>
                <Group align="flex-end">
                  <TextInput
                    ref={secret}
                    type="password"
                    label="Access token"
                    autoComplete="off"
                    style={{ flex: 1 }}
                  />
                  <TextInput
                    label="Organization (optional)"
                    description="Leave blank to bill your own account"
                    value={namespace}
                    onChange={(e) => setNamespace(e.target.value)}
                  />
                  <Button
                    onClick={() =>
                      change(async () => {
                        await api("connectProvider", {
                          token: secret.current?.value,
                          namespace: namespace.trim(),
                        });
                        if (secret.current) secret.current.value = "";
                      })
                    }
                  >
                    Connect
                  </Button>
                </Group>
              </Paper>
            ) : plan.error ? (
              <Alert color="orange">{plan.error}</Alert>
            ) : (
              <Stack gap="md">
                <Select
                  label="Training speed"
                  data={plan.training.map((t: any) => ({
                    value: t.flavor,
                    label: `${t.label} · ${t.speed} · up to ${usd(t.maxUSD)}`,
                  }))}
                  value={flavor}
                  allowDeselect={false}
                  onChange={setFlavor}
                />
                {training && (
                  <Stack gap="sm">
                    <Fact label="Training (one time)">
                      <Text size="sm" fw={600}>
                        Up to {usd(training.maxUSD)}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {usd(training.unitCostUSD)} per {training.unitLabel} on{" "}
                        {training.hardware}. It stops automatically after{" "}
                        {training.timeoutMinutes} minutes; the actual cost
                        depends on how long it runs.
                      </Text>
                    </Fact>
                    <Fact label="Hosting (ongoing)">
                      <Text size="sm">
                        Only if you publish after testing — from{" "}
                        {usd(Math.min(...plan.hosting.map((h: any) => h.pricePerHour)))}{" "}
                        per hour. You’ll approve this separately.
                      </Text>
                    </Fact>
                  </Stack>
                )}
                <Alert color="gray" title="What Relay sends to Hugging Face">
                  <Text size="sm">
                    The “{textColumn}” and “{labelColumn}” values from{" "}
                    {plural(plan.counts.train + plan.counts.eval, "row")} of{" "}
                    {plan.collection.fileName}. No other columns. They go to a
                    private dataset in {state.provider.namespace}, deleted when
                    training ends. The trained model and up to 20 test examples
                    are saved in a private model repository there.
                  </Text>
                </Alert>
                <Accordion variant="default">
                  <Accordion.Item value="detail">
                    <Accordion.Control>Technical detail</Accordion.Control>
                    <Accordion.Panel>
                      <Code block>
                        {JSON.stringify(
                          {
                            recipe: "text-classification",
                            baseModel: plan.baseModel,
                            hardware: flavor,
                            timeoutMinutes: training?.timeoutMinutes,
                            ...plan.settings,
                          },
                          null,
                          2,
                        )}
                      </Code>
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>
                {budgetNote}
                {training &&
                  approval(
                    `I approve sending this data to Hugging Face and up to ${usd(training.maxUSD)} in training charges.`,
                  )}
              </Stack>
            )}
            <Group justify="space-between">
              <Button variant="default" onClick={() => setStage(1)}>
                Back
              </Button>
              <Button
                disabled={!approved || !training || !state.provider.connected}
                onClick={() =>
                  change(async () => {
                    const m = await api("trainModel", {
                      collectionId,
                      textColumn,
                      labelColumn,
                      goal: chosenGoal,
                      name,
                      flavor,
                      approved,
                    });
                    setApproved(false);
                    open({ modelId: m.id });
                  })
                }
              >
                Start training
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}
      {model && (
        <Stack gap="xl">
          <Paper p="xl" withBorder radius="lg">
            <Group justify="space-between">
              <div>
                <Title order={3}>Training</Title>
                <Text size="sm" c="dimmed" mt={4}>
                  {model.state === "Training" || model.state === "Preparing"
                    ? `Hugging Face status: ${model.status || "starting"}. You can close Relay; it checks again when it opens.`
                    : `${plural(model.counts.train, "example")} for training, ${model.counts.eval} for testing on ${model.flavor} · up to ${usd(model.trainingEstimate.maxUSD)}`}
                </Text>
              </div>
              {model.state === "Training" && (
                <Button
                  variant="default"
                  onClick={() =>
                    change(() => api("cancelModel", { id: model.id }))
                  }
                >
                  Cancel training
                </Button>
              )}
            </Group>
            {model.error && (
              <Alert mt="md" color={model.state === "Failed" ? "red" : "orange"}>
                {model.error}
              </Alert>
            )}
          </Paper>
          {model.evaluation && (
            <Paper p="xl" withBorder radius="lg">
              <Title order={3}>Test results</Title>
              <Text mt="sm">
                Picked the right “{model.labelColumn}” for{" "}
                {Math.round(
                  model.evaluation.accuracy * model.evaluation.eval_examples,
                )}{" "}
                of {model.evaluation.eval_examples} test examples (
                {percent(model.evaluation.accuracy)}).
              </Text>
              <Text size="sm" c="dimmed" mt={4} mb="md">
                These examples were held back from training. Review the
                mistakes below before publishing; results on new text can
                differ.
              </Text>
              <ScrollArea>
                <Table striped mb="lg">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{model.labelColumn}</Table.Th>
                      <Table.Th>Test examples</Table.Th>
                      <Table.Th>Right when it picks this</Table.Th>
                      <Table.Th>Found of these</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {Object.entries(model.evaluation.per_label).map(
                      ([label, s]: any) => (
                        <Table.Tr key={label}>
                          <Table.Td>{label}</Table.Td>
                          <Table.Td>{s.examples}</Table.Td>
                          <Table.Td>{percent(s.precision)}</Table.Td>
                          <Table.Td>{percent(s.recall)}</Table.Td>
                        </Table.Tr>
                      ),
                    )}
                  </Table.Tbody>
                </Table>
                <Table striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{model.textColumn}</Table.Th>
                      <Table.Th>Correct</Table.Th>
                      <Table.Th>Model picked</Table.Th>
                      <Table.Th>Confidence</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {model.evaluation.samples.map((s: any, i: number) => (
                      <Table.Tr key={i}>
                        <Table.Td>{s.text}</Table.Td>
                        <Table.Td>{s.expected}</Table.Td>
                        <Table.Td>
                          <Badge
                            variant="light"
                            color={s.predicted === s.expected ? "teal" : "red"}
                          >
                            {s.predicted}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{percent(s.score)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>
          )}
          {["Evaluated", "Publishing", "Published"].includes(model.state) && (
            <Paper p="xl" withBorder radius="lg">
              <Title order={3}>Publish</Title>
              {model.state === "Evaluated" ? (
                <Stack mt="md">
                  <Text size="sm" c="dimmed">
                    Publishing starts paid hosting on Hugging Face so the{" "}
                    {model.team} team can use this model. Training is already
                    done; this is a separate, ongoing cost.
                  </Text>
                  {state.costs.error && (
                    <Alert color="orange">{state.costs.error}</Alert>
                  )}
                  {!state.costs.error && (
                    <>
                      <Select
                        label="Hosting"
                        data={state.costs.hosting.map((h: any) => ({
                          value: h.id,
                          label: `${h.label} · ${usd(h.pricePerHour)} per hour`,
                        }))}
                        value={host?.id || null}
                        allowDeselect={false}
                        onChange={setHosting}
                      />
                      {host && (
                        <Fact label="Hosting (ongoing)">
                          <Text size="sm" fw={600}>
                            {usd(host.pricePerHour)} per hour · about{" "}
                            {usd(host.pricePerHour * 720)} per 30 days
                          </Text>
                          <Text size="sm" c="dimmed">
                            Runs continuously until you stop hosting.
                          </Text>
                        </Fact>
                      )}
                      {budgetNote}
                      {host &&
                        approval(
                          `I approve hosting at ${usd(host.pricePerHour)} per hour until I stop it.`,
                        )}
                    </>
                  )}
                  <Group>
                    <Button
                      disabled={!approved || !host}
                      onClick={() =>
                        change(async () => {
                          await api("publishModel", {
                            id: model.id,
                            hosting: host.id,
                            approved,
                          });
                          setApproved(false);
                        })
                      }
                    >
                      Publish model
                    </Button>
                  </Group>
                </Stack>
              ) : (
                <Group justify="space-between" mt="md">
                  <Text size="sm">
                    {model.state === "Published"
                      ? `Published and tested · ${usd(model.hosting.pricePerHour)} per hour`
                      : `Starting hosting (${model.status || "pending"}). Relay tests it before marking it published.`}
                  </Text>
                  <Button
                    variant="default"
                    onClick={() =>
                      change(() => api("unpublishModel", { id: model.id }))
                    }
                  >
                    Stop hosting
                  </Button>
                </Group>
              )}
            </Paper>
          )}
          {model.state === "Published" && (
            <Paper p="xl" withBorder radius="lg">
              <Title order={3}>Use the model</Title>
              <Stack mt="md" gap="xl">
                <div>
                  <Text fw={600} mb="xs">
                    Try it in Relay
                  </Text>
                  <Group align="flex-end">
                    <Textarea
                      style={{ flex: 1 }}
                      label={model.textColumn}
                      minRows={2}
                      value={tryText}
                      onChange={(e) => setTryText(e.target.value)}
                    />
                    <Button
                      disabled={!tryText.trim()}
                      onClick={() =>
                        act(async () =>
                          setAnswer(
                            await api("predict", {
                              id: model.id,
                              text: tryText,
                            }),
                          ),
                        )
                      }
                    >
                      Try model
                    </Button>
                  </Group>
                  {answer && (
                    <Text size="sm" mt="sm">
                      {model.labelColumn}: <b>{answer.label}</b> ·{" "}
                      {percent(answer.score)} confident
                    </Text>
                  )}
                </div>
                <div>
                  <Text fw={600} mb={4}>
                    Use in an agent
                  </Text>
                  <Text size="sm" c="dimmed">
                    Members of {model.team} can add a step with the{" "}
                    <b>model</b> action and choose “{model.name}”. The step
                    reads text from an input or an earlier step and outputs{" "}
                    {"{ label, score }"}.
                  </Text>
                </div>
                <div>
                  <Text fw={600} mb={4}>
                    API access
                  </Text>
                  <Text size="sm" c="dimmed" mb="sm">
                    Tokens are scoped to this model and shown once. The API
                    answers on this computer while Relay is open.
                  </Text>
                  <Group>
                    <Button
                      variant="light"
                      onClick={() =>
                        act(async () => {
                          const r = await api("token", {
                            modelId: model.id,
                            name: "Model API",
                          });
                          setToken(r.token);
                        })
                      }
                    >
                      Create API token
                    </Button>
                    <Button
                      variant="default"
                      leftSection={<IconCopy size={16} />}
                      onClick={() =>
                        navigator.clipboard.writeText(
                          `curl -X POST http://127.0.0.1:4319/models/${model.id}/predict -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" -d '{"inputs":"Text to classify"}'`,
                        )
                      }
                    >
                      Copy API example
                    </Button>
                  </Group>
                  {token && (
                    <Code block mt="sm">
                      {token}
                    </Code>
                  )}
                  {data.tokens
                    .filter((t: any) => t.modelId === model.id)
                    .map((t: any) => (
                      <Group key={t.id} justify="space-between" mt="sm">
                        <Text size="sm">
                          {t.name} · {new Date(t.created).toLocaleDateString()}
                        </Text>
                        <Button
                          size="xs"
                          color="red"
                          variant="subtle"
                          onClick={() =>
                            act(() => api("revokeToken", { id: t.id }))
                          }
                        >
                          Revoke
                        </Button>
                      </Group>
                    ))}
                </div>
              </Stack>
            </Paper>
          )}
        </Stack>
      )}
    </>
  );
}
function AddCollection({ opened, close, teams, change }: any) {
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (opened) setFailure(""); }, [opened]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [team, setTeam] = useState<string | null>(teams[0]?.value || null);
  const [file, setFile] = useState<File | null>(null);
  return (
    <Modal opened={opened} onClose={close} title="Add data collection" centered>
      <Stack>
        {failure && <Alert color="red" title="Couldn’t add this file">{failure}</Alert>}
        <TextInput
          label="Name"
          placeholder="Customer accounts"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Textarea
          label="Description"
          placeholder="What this data is and when to use it"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Select
          label="Team that can use it"
          data={teams}
          value={team}
          allowDeselect={false}
          onChange={setTeam}
        />
        <FileInput
          label="File"
          description="CSV or Excel (.xlsx), up to 10 MB"
          placeholder="Choose a file"
          accept=".csv,.xlsx"
          value={file}
          onChange={setFile}
        />
        <Button
          disabled={!name.trim() || !team || !file}
          loading={saving}
          onClick={() =>
            change(async () => {
              setSaving(true); setFailure("");
              try {
              await api("addCollection", {
                name,
                description,
                team,
                fileName: file!.name,
                base64: await toBase64(file!),
              });
              setName("");
              setDescription("");
              setFile(null);
              close();
              } catch (e) { setFailure((e as Error).message); throw e; }
              finally { setSaving(false); }
            })
          }
        >
          Add collection
        </Button>
      </Stack>
    </Modal>
  );
}
function Empty({ title, text }: any) {
  return (
    <Paper withBorder radius="lg" className="empty">
      <div className="agent-icon">
        <IconStack2 size={25} />
      </div>
      <Title order={3}>{title}</Title>
      <Text size="sm" c="dimmed">
        {text}
      </Text>
    </Paper>
  );
}
function Steps({ steps }: { steps: Step[] }) {
  return (
    <Stack gap={0}>
      {steps.map((s, i) => (
        <div className="step-row" key={s.id}>
          <span className="step-number">{i + 1}</span>
          <div>
            <Text fw={550}>{s.title}</Text>
            <Text size="sm" c="dimmed" mt={4}>
              {s.reason}
            </Text>
          </div>
          <Badge
            ml="auto"
            color={s.recommendation === "Automate" ? "teal" : "orange"}
            variant="light"
          >
            {s.recommendation}
          </Badge>
        </div>
      ))}
    </Stack>
  );
}
function Wizard({ initial, data, close, changed, fail }: any) {
  const [form, setForm] = useState<any>(
    initial || {
      name: "",
      description: "",
      workflow: workflowSchema.parse({ steps: [] }),
      status: "Draft",
      shared: false,
      location: "local",
      intervalMinutes: null,
      wizardStage: 0,
    },
  );
  const [stage, setStage] = useState(initial?.wizardStage || 0);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState("[]");
  const [ai, setAi] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const receivedRecording = useRef("");
  const recording =
    data.recordingSession?.agentId === form.id ? data.recordingSession : null;
  const recordingActive =
    recording && ["starting", "recording", "paused"].includes(recording.status);
  useEffect(() => {
    if (
      recording?.status === "finished" &&
      receivedRecording.current !== recording.id
    ) {
      receivedRecording.current = recording.id;
      setEvents(JSON.stringify(recording.events, null, 2));
      setForm((f: any) => ({
        ...f,
        workflow: { ...f.workflow, steps: recording.workflow.steps },
      }));
      setStage(2);
      void api("recordingControl", { action: "reviewed" }).catch(() =>
        setRecordingError(
          "Couldn’t save the review. Please keep Relay open and retry.",
        ),
      );
    }
  }, [recording?.id, recording?.status]);
  async function startRecording() {
    setRecordingBusy(true);
    setRecordingError("");
    try {
      if (recording && ["error", "interrupted"].includes(recording.status)) {
        if (
          recording.count &&
          !window.confirm("Discard the saved actions and start again?")
        )
          return;
        await api("recordingControl", { action: "cancel", confirm: true });
      }
      const saved = await save({ status: "Draft" });
      if (!saved) throw Error("Give your agent a name first.");
      const result = await api("startRecording", { agentId: saved.id });
      if (result.status === "error") setRecordingError(result.error);
      await changed();
    } catch (e) {
      setRecordingError((e as Error).message);
    } finally {
      setRecordingBusy(false);
    }
  }
  async function controlRecording(action: string) {
    if (
      action === "cancel" &&
      recording?.count &&
      !window.confirm(
        "Discard this demonstration? Your recorded actions will be lost.",
      )
    )
      return;
    try {
      await api("recordingControl", { action, confirm: true });
      await changed();
    } catch {
      setRecordingError("Couldn’t update the recording. Please retry.");
    }
  }
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [untested, setUntested] = useState(false);
  const [runId, setRunId] = useState("");
  const latest = useRef(form);
  latest.current = form;
  const saveChain = useRef(Promise.resolve());
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  async function save(extra: any = {}) {
    const task = saveChain.current.then(async () => {
      const value = { ...latest.current, ...extra, wizardStage: stage };
      if (!value.name.trim()) return;
      setSaving(true);
      try {
        const saved = await api("saveAgent", value);
        if (mounted.current)
          setForm((f: any) => ({ ...f, id: saved.id, version: saved.version }));
        latest.current = {
          ...latest.current,
          id: saved.id,
          version: saved.version,
        };
        await changed();
        return saved;
      } finally {
        if (mounted.current) setSaving(false);
      }
    });
    saveChain.current = task.catch(() => {});
    return task;
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      save({ status: "Draft" }).catch((e: any) => fail(e.message));
    }, 900);
    return () => clearTimeout(timer);
  }, [
    form.name,
    form.description,
    JSON.stringify(form.workflow),
    form.location,
    form.shared,
    form.intervalMinutes,
    stage,
  ]);
  const set = (key: string, value: any) =>
    setForm((f: any) => ({ ...f, [key]: value }));
  const wf = (value: Partial<Workflow>) =>
    set("workflow", { ...form.workflow, ...value });
  const updateStep = (i: number, value: Partial<Step>) =>
    wf({
      steps: form.workflow.steps.map((s: Step, index: number) =>
        index === i ? { ...s, ...value } : s,
      ),
    });
  async function perform(fn: () => Promise<any>) {
    try {
      await fn();
    } catch (e) {
      fail((e as Error).message);
    }
  }
  const testRun =
    data.runs.find((r: Run) => r.id === runId) ||
    data.runs.filter((r: Run) => r.agentId === form.id).at(-1);
  const issues = data.readiness[form.id] || [];
  return (
    <>
      <Group justify="space-between" mb="xl">
        <div>
          <Text size="xs" c="teal" fw={700} tt="uppercase" mb={6}>
            {initial ? "Edit agent" : "Create an agent"}
          </Text>
          <Title order={1}>{form.name || "A little less busywork"}</Title>
        </div>
        <Group>
          <Text size="xs" c="dimmed">
            {saving ? "Saving…" : form.id ? "Draft saved" : "Start with a name"}
          </Text>
          <Button
            variant="subtle"
            color="gray"
            disabled={!!recordingActive || recordingBusy}
            onClick={() =>
              perform(async () => {
                await save({ status: "Draft" });
                close();
              })
            }
          >
            Save & close
          </Button>
        </Group>
      </Group>
      <Stepper
        active={stage}
        onStepClick={recordingActive || recordingBusy ? undefined : setStage}
        size="sm"
        mb={36}
      >
        {["Describe", "Demonstrate", "Review", "Connect", "Test", "Enable"].map(
          (label) => (
            <Stepper.Step key={label} label={label} />
          ),
        )}
      </Stepper>
      <Paper p={32} withBorder radius="lg">
        <Stack gap="lg">
          {stage === 0 && (
            <>
              <Title order={2}>What would you like to get done?</Title>
              <TextInput
                label="Agent name"
                placeholder="e.g. Prepare overdue orders"
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
              <Textarea
                label="Desired outcome"
                placeholder="Describe the useful result, in your own words."
                minRows={3}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
              <Textarea
                label="Example input (optional)"
                value={form.workflow.instructions}
                onChange={(e) => wf({ instructions: e.target.value })}
              />
              <Select
                label="Suggested result format"
                value={form.workflow.output.format}
                onChange={(v) =>
                  wf({ output: { ...form.workflow.output, format: v as any } })
                }
                data={[
                  { value: "table", label: "Searchable table" },
                  { value: "report", label: "Readable report" },
                  { value: "files", label: "Files and a confirmation" },
                ]}
              />
            </>
          )}
          {stage === 1 && (
            <>
              <Title order={2}>Show Relay how you do it</Title>
              <Text size="sm" c="dimmed">
                We’ll open a browser for your demonstration.
              </Text>
              <Group>
                <Button
                  leftSection={<IconBrowser size={18} />}
                  loading={recordingBusy}
                  disabled={!!recordingActive}
                  onClick={startRecording}
                >
                  Start recording
                </Button>
                <Button variant="default" component="label">
                  Import recording
                  <input
                    type="file"
                    accept=".json"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        f.text()
                          .then((t) => {
                            const parsed = JSON.parse(t);
                            setEvents(
                              JSON.stringify(parsed.events || parsed, null, 2),
                            );
                          })
                          .catch(() =>
                            fail("Choose a valid recording JSON file"),
                          );
                    }}
                  />
                </Button>
                <Button
                  variant="subtle"
                  onClick={() => {
                    wf({
                      steps: [
                        ...form.workflow.steps,
                        {
                          id: crypto.randomUUID(),
                          title: "Open a page",
                          action: "navigate",
                          url: "http://127.0.0.1:4318/orders",
                          output: "result",
                          recommendation: "Automate",
                          reason: "Review this manually authored step.",
                        },
                      ],
                    });
                    setStage(2);
                  }}
                >
                  Write steps manually
                </Button>
              </Group>
              {(recordingError || recording?.error) && (
                <Alert color="red" title="Recording stopped">
                  {recordingError || recording.error}
                  <Group mt="sm">
                    <Button
                      size="xs"
                      onClick={startRecording}
                      loading={recordingBusy}
                    >
                      Retry
                    </Button>
                    {recording?.count > 0 && (
                      <Button
                        size="xs"
                        variant="default"
                        onClick={() => controlRecording("finish")}
                      >
                        Review saved actions
                      </Button>
                    )}
                  </Group>
                </Alert>
              )}
              {recordingActive && (
                <Group>
                  <Badge variant="light">
                    {recording.status === "paused" ? "Paused" : "Recording"} ·{" "}
                    {recording.count} actions
                  </Badge>
                  <Button
                    variant="default"
                    onClick={() =>
                      controlRecording(
                        recording.status === "paused" ? "resume" : "pause",
                      )
                    }
                  >
                    {recording.status === "paused" ? "Resume" : "Pause"}
                  </Button>
                  <Button onClick={() => controlRecording("finish")}>
                    Finish
                  </Button>
                  <Button
                    variant="subtle"
                    color="gray"
                    onClick={() => controlRecording("cancel")}
                  >
                    Cancel
                  </Button>
                  <Text size="xs" c="dimmed">
                    Use the browser to demonstrate your task. Only approved
                    websites are recorded.
                  </Text>
                </Group>
              )}
              <details>
                <summary>Import or review a saved recording</summary>
                <Select
                  label="Received recordings"
                  placeholder="Choose a recording"
                  data={data.recordings.map((r: any) => ({
                    value: r.id,
                    label: `${new Date(r.created).toLocaleString()} · ${r.events.length} actions`,
                  }))}
                  onChange={(v) =>
                    setEvents(
                      JSON.stringify(
                        data.recordings.find((r: any) => r.id === v)?.events ||
                          [],
                        null,
                        2,
                      ),
                    )
                  }
                />
                <Textarea
                  label="Review and redact before interpretation"
                  description="Remove any private values before continuing."
                  autosize
                  minRows={5}
                  maxRows={12}
                  value={events}
                  onChange={(e) => setEvents(e.target.value)}
                />
                <Checkbox
                  checked={ai}
                  onChange={(e) => setAi(e.currentTarget.checked)}
                  label="Use configured AI provider to interpret this recording"
                />
                <Text size="xs" c="dimmed">
                  Without a provider, Relay converts recorded events directly.
                  It does not infer unseen work.
                </Text>
                <Button
                  variant="light"
                  onClick={() =>
                    perform(async () => {
                      const result = await api("interpret", {
                        events: JSON.parse(events),
                        ai,
                      });
                      wf(result);
                      setStage(2);
                    })
                  }
                >
                  Convert to steps
                </Button>
              </details>
            </>
          )}
          {stage === 2 && (
            <>
              <Title order={2}>Make it repeatable</Title>
              <Text size="sm" c="dimmed">
                Check each action. Replace changing values with{" "}
                {"{{inputName}}"}.
              </Text>
              {form.workflow.steps.map((s: Step, i: number) => (
                <Paper withBorder p="md" key={s.id}>
                  <Group mb="md">
                    <span className="step-number">{i + 1}</span>
                    <TextInput
                      style={{ flex: 1 }}
                      aria-label={`Step ${i + 1} name`}
                      value={s.title}
                      onChange={(e) => updateStep(i, { title: e.target.value })}
                    />
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() =>
                        wf({
                          steps: form.workflow.steps.filter(
                            (_: any, j: number) => j !== i,
                          ),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </Group>
                  <Group grow align="flex-start">
                    <Select
                      label="Action"
                      data={[...actions]}
                      value={s.action}
                      onChange={(v) =>
                        updateStep(i, {
                          action: v as any,
                          assignedTo: v === "human" ? "runner" : undefined,
                        })
                      }
                    />
                    <Select
                      label="Recommendation"
                      data={[
                        "Automate",
                        "Review before continuing",
                        "Keep manual",
                        "Unsupported with current tools",
                      ]}
                      value={s.recommendation}
                      onChange={(v) =>
                        updateStep(i, { recommendation: v as any })
                      }
                    />
                  </Group>
                  {["navigate", "http", "tab"].includes(s.action) && (
                    <TextInput
                      mt="md"
                      label="Page URL"
                      value={s.url || ""}
                      onChange={(e) => updateStep(i, { url: e.target.value })}
                    />
                  )}{" "}
                  {![
                    "navigate",
                    "spreadsheet",
                    "human",
                    "http",
                    "transform",
                    "tab",
                  ].includes(s.action) && (
                    <TextInput
                      mt="md"
                      label="Target"
                      placeholder={'role=button[name="Submit"] or label=Search'}
                      value={s.locator || ""}
                      onChange={(e) =>
                        updateStep(i, { locator: e.target.value })
                      }
                    />
                  )}
                  <Group grow mt="md">
                    <TextInput
                      label="Value / input"
                      value={s.value || ""}
                      onChange={(e) => updateStep(i, { value: e.target.value })}
                    />
                    <TextInput
                      label="Output name"
                      value={s.output}
                      onChange={(e) =>
                        updateStep(i, { output: e.target.value })
                      }
                    />
                    {s.action === "model" && (
                      <Select
                        label="Model"
                        placeholder={
                          data.models.length
                            ? "Choose a model"
                            : "No published models for your team"
                        }
                        value={s.model || null}
                        data={data.models.map((m: any) => ({
                          value: m.id,
                          label: m.name,
                        }))}
                        onChange={(v) =>
                          updateStep(i, { model: v || undefined })
                        }
                      />
                    )}
                    {["upload", "spreadsheet", "transform", "model"].includes(
                      s.action,
                    ) && (
                      <Select
                        label="File / data from step"
                        value={s.file || null}
                        data={[
                          {
                            group: "Earlier steps",
                            items: form.workflow.steps
                              .slice(0, i)
                              .map((p: Step) => ({
                                value: p.output,
                                label: p.title,
                              })),
                          },
                          ...(["transform", "model"].includes(s.action)
                            ? []
                            : [
                                {
                                  group: "Team data",
                                  items: data.collections.map((c: any) => ({
                                    value: `collection:${c.id}`,
                                    label: c.name,
                                  })),
                                },
                              ]),
                        ]}
                        onChange={(v) =>
                          updateStep(i, { file: v || undefined })
                        }
                      />
                    )}
                  </Group>
                  <TextInput
                    mt="md"
                    label="Success check (visible text, optional)"
                    value={s.success || ""}
                    onChange={(e) => updateStep(i, { success: e.target.value })}
                  />
                </Paper>
              ))}
              <Button
                variant="light"
                leftSection={<IconPlus size={16} />}
                onClick={() =>
                  wf({
                    steps: [
                      ...form.workflow.steps,
                      {
                        id: crypto.randomUUID(),
                        title: "New step",
                        action: "human",
                        assignedTo: "runner",
                        output: `step${form.workflow.steps.length}`,
                        recommendation: "Keep manual",
                        reason: "Employee completes this step.",
                      },
                    ],
                  })
                }
              >
                Add step
              </Button>
              <Accordion>
                <Accordion.Item value="inputs">
                  <Accordion.Control>
                    Reusable inputs and expected outputs
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack>
                      {form.workflow.inputs.map((input: any, i: number) => (
                        <Group grow key={i}>
                          <TextInput
                            label="Input name"
                            value={input.name}
                            onChange={(e) =>
                              wf({
                                inputs: form.workflow.inputs.map(
                                  (x: any, j: number) =>
                                    j === i
                                      ? { ...x, name: e.target.value }
                                      : x,
                                ),
                              })
                            }
                          />
                          <TextInput
                            label="Label"
                            value={input.label}
                            onChange={(e) =>
                              wf({
                                inputs: form.workflow.inputs.map(
                                  (x: any, j: number) =>
                                    j === i
                                      ? { ...x, label: e.target.value }
                                      : x,
                                ),
                              })
                            }
                          />
                        </Group>
                      ))}
                      <Button
                        variant="default"
                        onClick={() =>
                          wf({
                            inputs: [
                              ...form.workflow.inputs,
                              {
                                name: `input${form.workflow.inputs.length + 1}`,
                                label: "New input",
                                required: true,
                              },
                            ],
                          })
                        }
                      >
                        Add input
                      </Button>
                      <TextInput
                        label="Expected outputs (comma separated)"
                        value={form.workflow.expectedOutputs.join(", ")}
                        onChange={(e) =>
                          wf({
                            expectedOutputs: e.target.value
                              .split(",")
                              .map((v) => v.trim()),
                          })
                        }
                      />
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            </>
          )}
          {stage === 3 && (
            <>
              <Title order={2}>Connect the right account</Title>
              <Text size="sm" c="dimmed">
                Connections belong to you, even when an agent is shared.
              </Text>
              <MultiSelect
                label="Approved websites"
                description="Only websites your admin approved for your team are listed."
                value={form.workflow.sites}
                data={data.sites
                  .filter(
                    (s: any) =>
                      data.allowedSites.includes(s.id) ||
                      form.workflow.sites.includes(s.id),
                  )
                  .map((s: any) => ({
                    value: s.id,
                    label: s.name,
                  }))}
                onChange={(v) => wf({ sites: v })}
              />
              {form.workflow.sites.map((site: string) => (
                <Paper withBorder p="lg" key={site}>
                  <Group justify="space-between">
                    <div>
                      <Text fw={600}>
                        {data.sites.find((s: any) => s.id === site)?.name ||
                          site}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {form.location} account
                      </Text>
                    </div>
                    <Badge
                      color={
                        data.connections.some(
                          (c: any) =>
                            c.site === site && c.location === form.location,
                        )
                          ? "teal"
                          : "orange"
                      }
                    >
                      {data.connections.some(
                        (c: any) =>
                          c.site === site && c.location === form.location,
                      )
                        ? "Connected"
                        : "Needs connection"}
                    </Badge>
                  </Group>
                  <Group mt="md">
                    <Button
                      variant="light"
                      onClick={() =>
                        perform(() =>
                          api("connect", { site, location: form.location }),
                        )
                      }
                    >
                      Open sign-in browser
                    </Button>
                    <Button
                      variant="default"
                      onClick={() =>
                        perform(async () => {
                          await api("finishConnect", { site });
                          await changed();
                        })
                      }
                    >
                      I’ve signed in
                    </Button>
                  </Group>
                </Paper>
              ))}
              <Accordion>
                <Accordion.Item value="tools">
                  <Accordion.Control>Tools and permissions</Accordion.Control>
                  <Accordion.Panel>
                    <Text size="sm">
                      This workflow uses:{" "}
                      {[
                        ...new Set(
                          form.workflow.steps.map((s: Step) => s.action),
                        ),
                      ].join(", ")}
                      . Website and tool access is checked again when the run
                      starts.
                    </Text>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            </>
          )}
          {stage === 4 && (
            <>
              <Title order={2}>Try it with real inputs</Title>
              <Text size="sm" c="dimmed">
                A dedicated browser opens for the test. Review the result before
                enabling.
              </Text>
              {form.workflow.inputs.map((i: any) => (
                <TextInput
                  key={i.name}
                  label={i.label}
                  value={inputs[i.name] || ""}
                  onChange={(e) =>
                    setInputs({ ...inputs, [i.name]: e.target.value })
                  }
                />
              ))}
              <Button
                leftSection={<IconPlayerPlay size={17} />}
                onClick={() =>
                  perform(async () => {
                    const a = await save({ status: "Draft" });
                    if (!a) throw Error("Name your agent first");
                    const r = await api("run", {
                      id: a.id,
                      inputs,
                      test: true,
                    });
                    setRunId(r.id);
                    await changed();
                  })
                }
              >
                Run test
              </Button>
              {testRun && (
                <Paper withBorder p="lg">
                  <Group justify="space-between">
                    <Text>
                      Step {testRun.step + 1} ·{" "}
                      {testRun.workflow.steps[testRun.step]?.title ||
                        "Finished"}
                    </Text>
                    <Badge color={color(testRun.state)}>{testRun.state}</Badge>
                  </Group>
                  {testRun.error && (
                    <Alert mt="md" color="orange">
                      {testRun.error}
                    </Alert>
                  )}
                  <Group mt="md">
                    {testRun.state === "Needs input" && (
                      <Button
                        onClick={() =>
                          perform(() => api("resume", { id: testRun.id }))
                        }
                      >
                        Review complete · Resume
                      </Button>
                    )}
                    {["Running", "Queued", "Needs input"].includes(
                      testRun.state,
                    ) && (
                      <Button
                        variant="default"
                        onClick={() =>
                          perform(() => api("cancel", { id: testRun.id }))
                        }
                      >
                        Stop test
                      </Button>
                    )}
                  </Group>
                  {testRun.state === "Completed" && (
                    <Text c="teal" mt="md">
                      Test completed. Files and collected information are saved
                      in Results.
                    </Text>
                  )}
                </Paper>
              )}
            </>
          )}
          {stage === 5 && (
            <>
              <Title order={2}>Ready for the next time</Title>
              <Select
                label="Execution"
                value={form.location}
                onChange={(v) => set("location", v)}
                data={[
                  { value: "local", label: "On this computer" },
                  { value: "hosted", label: "Hosted worker" },
                ]}
              />
              <Text size="xs" c="dimmed">
                Local runs require an awake computer and a running app. Hosted
                runs require a deployed worker and separate connections.
              </Text>
              <NumberInput
                label="Run every (minutes, leave blank for manual)"
                min={1}
                value={form.intervalMinutes || ""}
                onChange={(v) =>
                  set("intervalMinutes", typeof v === "number" ? v : null)
                }
              />
              <Select
                label="Repeated results"
                value={form.workflow.output.mode}
                data={[
                  { value: "append", label: "Append new records" },
                  { value: "update", label: "Update matching records" },
                  {
                    value: "dated",
                    label: "Save a separate dated output per run",
                  },
                ]}
                onChange={(v) =>
                  wf({ output: { ...form.workflow.output, mode: v as any } })
                }
              />
              {form.workflow.output.mode === "update" && (
                <TextInput
                  label="Unique record key"
                  value={form.workflow.output.uniqueKey}
                  onChange={(e) =>
                    wf({
                      output: {
                        ...form.workflow.output,
                        uniqueKey: e.target.value,
                      },
                    })
                  }
                />
              )}
              <Switch
                label="Share the agent with my team"
                checked={form.shared}
                onChange={(e) => set("shared", e.currentTarget.checked)}
              />
              <Alert
                color={issues.length ? "orange" : "teal"}
                title={
                  issues.length
                    ? "A few things to finish"
                    : "Connections and steps are ready"
                }
              >
                {issues.length
                  ? issues.map((s: string) => (
                      <Text size="sm" key={s}>
                        {s}
                      </Text>
                    ))
                  : "A successful test checks this workflow today; websites can change."}
              </Alert>
              <Checkbox
                label="Enable without a successful test of this workflow (untested)"
                checked={untested}
                onChange={(e) => setUntested(e.currentTarget.checked)}
              />
              <Text size="xs" c="dimmed">
                API tokens are available in Agent settings → Integrations after
                saving.
              </Text>
            </>
          )}
        </Stack>
      </Paper>
      <Group justify="space-between" mt="xl">
        <Button
          variant="default"
          leftSection={<IconArrowLeft size={16} />}
          disabled={stage === 0 || !!recordingActive || recordingBusy}
          onClick={() => setStage(stage - 1)}
        >
          Back
        </Button>
        {stage < 5 ? (
          <Button
            rightSection={<IconArrowRight size={16} />}
            disabled={!form.name.trim() || !!recordingActive || recordingBusy}
            onClick={() =>
              perform(async () => {
                await save({ status: "Draft" });
                setStage(stage + 1);
              })
            }
          >
            Continue
          </Button>
        ) : (
          <Group>
            <Button
              variant="default"
              onClick={() =>
                perform(async () => {
                  await save({ status: "Draft" });
                  close();
                })
              }
            >
              Keep as draft
            </Button>
            <Button
              leftSection={<IconCheck size={16} />}
              onClick={() =>
                perform(async () => {
                  await save({ status: "Ready", untested });
                  close();
                })
              }
            >
              Save and enable
            </Button>
          </Group>
        )}
      </Group>
    </>
  );
}
function Settings({ opened, close, data, act }: any) {
  const [endpoint, setEndpoint] = useState(
    data.settings.endpoint || "https://api.openai.com/v1",
  );
  const [model, setModel] = useState(data.settings.model || "");
  const key = useRef<HTMLInputElement>(null);
  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Application settings"
      centered
      size="lg"
    >
      <Stack>
        <Title order={4}>Workflow interpretation</Title>
        <Text size="sm" c="dimmed">
          Optional. Manual authoring and direct recording conversion work
          without a model provider.
        </Text>
        <TextInput
          label="OpenAI-compatible endpoint"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
        />
        <TextInput
          label="Model identifier"
          placeholder="Your provider’s supported model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
        <TextInput
          type="password"
          ref={key}
          label="Provider API key"
          autoComplete="off"
          description="Stored using the operating system’s encrypted secret storage."
        />
        <Button
          onClick={() =>
            act(async () => {
              await api("settings", {
                endpoint,
                model,
                key: key.current?.value,
              });
              if (key.current) key.current.value = "";
              close();
            })
          }
        >
          Save provider
        </Button>
        <Divider />
        <Text size="sm">
          Relay 0.1 · Demo identity switching is not secure authentication.
        </Text>
      </Stack>
    </Modal>
  );
}
createRoot(document.getElementById("root")!).render(
  <MantineProvider
    theme={{
      primaryColor: "teal",
      defaultRadius: "md",
      fontFamily:
        'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      headings: { fontWeight: "650" },
      colors: {
        teal: [
          "#e9f8f8",
          "#d4eeee",
          "#a5dcdc",
          "#72c8c9",
          "#48b7b9",
          "#2daaad",
          "#16878e",
          "#117780",
          "#0c6670",
          "#07545f",
        ],
      },
    }}
  >
    <App />
  </MantineProvider>,
);
