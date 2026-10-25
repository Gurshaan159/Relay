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
          {[
            ["My agents", IconStack2],
            ["Team agents", IconUsers],
            ["Connections", IconPlug],
          ].map(([label, Icon]: any) => (
            <button
              key={label}
              className={`nav ${page === label ? "active" : ""}`}
              onClick={() => nav(label)}
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
                      setError("");
                    })
                  }
                >
                  {e.name} · {e.team}
                </Menu.Item>
              ))}
              <Menu.Divider />
              <Menu.Item onClick={() => setAdmin(false)}>Employee</Menu.Item>
              <Menu.Item onClick={() => setAdmin(true)}>Admin</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </AppShell.Navbar>
      <AppShell.Main>
        <div className="topbar">
          <Text size="sm" c="dimmed">
            Northstar Supply <span className="slash">/</span>{" "}
            {data.employee.team}
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
          {admin ? (
            <div className="empty">
              <IconUsers size={40} />
              <Title order={2}>Admin workspace coming later</Title>
              <Button onClick={() => setAdmin(false)}>
                Return to Employee
              </Button>
            </div>
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
  const [signing, setSigning] = useState(false);
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
        {data.sites.map((site: any) => {
          const c = data.connections.find(
            (c: any) => c.site === site.id && c.location === location,
          );
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
                <Badge color={c ? "teal" : "orange"}>
                  {c?.status || "Needs connection"}
                </Badge>
              </Group>
              <Divider my="lg" />
              <Group justify="space-between">
                <div>
                  <Text size="sm">
                    {c?.account || "Sign in directly in a dedicated browser."}
                  </Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    Available to your runs that require this website.
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
                ) : signing ? (
                  <Button
                    onClick={() =>
                      act(async () => {
                        await api("finishConnect", { site: site.id });
                        setSigning(false);
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
                        setSigning(true);
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
  const [pair, setPair] = useState<any>();
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
      <Stepper active={stage} onStepClick={setStage} size="sm" mb={36}>
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
              <Title order={2}>Show Relay the task</Title>
              <Text size="sm" c="dimmed">
                Record deliberate actions in an approved browser tab, or add
                steps yourself.
              </Text>
              <Group>
                <Button
                  leftSection={<IconBrowser size={18} />}
                  onClick={() =>
                    perform(async () => setPair(await api("pair")))
                  }
                >
                  Pair browser recorder
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
              {pair && (
                <Alert title="Connect your recorder" color="teal">
                  Load packages/recorder-extension in Chrome’s extensions
                  developer mode. Open its popup and paste this one-time pairing
                  code (expires in 5 minutes):
                  <Code block mt="sm">
                    {pair.code}
                  </Code>
                </Alert>
              )}
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
                Without a provider, Relay converts recorded events directly. It
                does not infer unseen work.
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
                    {["upload", "spreadsheet", "transform"].includes(
                      s.action,
                    ) && (
                      <Select
                        label="File / data from step"
                        value={s.file || null}
                        data={form.workflow.steps
                          .slice(0, i)
                          .map((p: Step) => ({
                            value: p.output,
                            label: p.title,
                          }))}
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
                value={form.workflow.sites}
                data={data.sites.map((s: any) => ({
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
          disabled={stage === 0}
          onClick={() => setStage(stage - 1)}
        >
          Back
        </Button>
        {stage < 5 ? (
          <Button
            rightSection={<IconArrowRight size={16} />}
            disabled={!form.name.trim()}
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
        <Text size="xs" c="dimmed">
          Recorder installation: load packages/recorder-extension as an unpacked
          Chromium extension, then pair from the Demonstrate step.
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
