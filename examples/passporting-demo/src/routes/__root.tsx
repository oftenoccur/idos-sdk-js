import {
  Center,
  Container,
  Flex,
  Grid,
  HStack,
  Heading,
  Image,
  Show,
  Text,
  chakra,
} from "@chakra-ui/react";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Link, Outlet, createRootRouteWithContext, useNavigate } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

import { Button } from "@/components/ui";
import { IDOSProvider } from "@/idOS.provider";
import { injectedConnector } from "@/wagmi.config";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootComponent,
  notFoundComponent: () => {
    return (
      <Center flexDirection="column" h="100dvh">
        <Text color="red.500">Route not found</Text>
      </Center>
    );
  },
});

function ConnectWallet() {
  const { connect, isPending } = useConnect();
  return (
    <Center h="100dvh" flexDirection="column" gap="4">
      <Heading fontSize="xl">Connect your wallet to continue</Heading>
      <Button
        minW={225}
        loading={isPending}
        loadingText="Waiting Wallet"
        onClick={() => connect({ connector: injectedConnector })}
      >
        Connect your Browser wallet
      </Button>
    </Center>
  );
}

function RootComponent() {
  const { disconnect } = useDisconnect();
  const { isConnected } = useAccount();

  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });

  useEffect(() => {
    if (!isConnected) {
      queryClient.clear();
      navigate({
        search: {},
      });
    }
  }, [isConnected, queryClient, navigate]);

  if (!isConnected) {
    return <ConnectWallet />;
  }

  return (
    <Grid gridTemplateRows=" auto 1fr auto" minH="100dvh">
      <chakra.header bg="gray.950" pos="sticky" top="0" zIndex="sticky">
        <Container>
          <Flex alignItems="center" justifyContent="space-between" h="20">
            <Link to="/">
              <HStack gap="2">
                <Image src="/logo.svg" alt="idOS" width="10" height="10" />
                <Text fontSize="lg">idOS Passporting Demo</Text>
              </HStack>
            </Link>
            <Show when={isConnected}>
              <Button onClick={() => disconnect()}>Disconnect</Button>
            </Show>
          </Flex>
        </Container>
      </chakra.header>
      <chakra.main paddingY="6">
        <IDOSProvider>
          <Outlet />
        </IDOSProvider>
      </chakra.main>
      <chakra.div id="idOS-enclave" hidden />
      <ReactQueryDevtools buttonPosition="bottom-left" />
      <TanStackRouterDevtools position="bottom-right" />
    </Grid>
  );
}
