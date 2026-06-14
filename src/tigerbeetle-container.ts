import { AbstractStartedContainer, GenericContainer, Wait } from 'testcontainers';

const TIGERBEETLE_PORT = 3000;
const CLUSTER_ID = 0n;
const DATA_FILE = '/data/0_0.tigerbeetle';
const DEFAULT_IMAGE = 'ghcr.io/tigerbeetle/tigerbeetle:0.17.6';

export class TigerBeetleContainer extends GenericContainer {
  constructor(image: string = DEFAULT_IMAGE) {
    super(image);
    this.withExposedPorts(TIGERBEETLE_PORT)
      .withEntrypoint(['tini', '--', '/bin/sh', '-c'])
      .withCommand([
        [
          'mkdir -p /data',
          `/tigerbeetle format --development --cluster=${CLUSTER_ID} --replica=0 --replica-count=1 ${DATA_FILE}`,
          `exec /tigerbeetle start --development --addresses=0.0.0.0:${TIGERBEETLE_PORT} ${DATA_FILE}`,
        ].join(' && '),
      ])
      // TigerBeetle requires this flag because Docker blocks the io_uring syscalls otherwise
      .withSecurityOpt('seccomp=unconfined')
      // macOS Docker VMs may block the memory locking TigerBeetle performs at startup
      .withUlimits({ memlock: { soft: -1, hard: -1 } })
      .withWaitStrategy(Wait.forListeningPorts())
      .withStartupTimeout(30_000);
  }

  public override async start(): Promise<StartedTigerBeetleContainer> {
    return new StartedTigerBeetleContainer(await super.start());
  }
}

export class StartedTigerBeetleContainer extends AbstractStartedContainer {
  public getPort(): number {
    return this.getMappedPort(TIGERBEETLE_PORT);
  }

  public getAddress(): string {
    const host = this.getHost();
    const resolvedHost = host === 'localhost' ? '127.0.0.1' : host;
    return `${resolvedHost}:${this.getPort()}`;
  }

  public getClusterId(): bigint {
    return CLUSTER_ID;
  }
}
