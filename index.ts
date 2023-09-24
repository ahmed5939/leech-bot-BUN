/**
 * This script logs into a Fortnite account using device authorization or an authorization code, sets the account's skin and backpack, and joins parties based on incoming party invites. If the account is already in a party, it sends a message to the party chat and adds the party to a queue. When the account leaves the party, it automatically joins the next party in the queue until the queue is empty.
/**
 * This script uses the `fnbr` library to interact with the Fortnite API.
 * @packageDocumentation
 */
import { Client } from 'fnbr';

let queue: string[] = [];

(async () => {
  const config: any = Bun.file("config.json", { type: "application/json" });
  let auth: any;

  try {
    const dauth = Bun.file("deviceAuth.json", { type: "application/json" });
    const jsonauth = await dauth.json();
    auth = { deviceAuth: jsonauth };
  } catch (e) {
    auth = { authorizationCode: async () => Client.consoleQuestion('Please enter an authorization code: ') };
  }

  const client = new Client({ auth });

  client.on('deviceauth:created', (da) => Bun.write("deviceAuth.json", JSON.stringify(da, null, 2)));

  await client.login();
  console.log(`Logged in as ${client.user?.displayName}`);
  client.setStatus(config.data.idle_status);

  // set the skin and backpack
  client.party?.me.setOutfit('CID_A_069_Athena_Commando_M_Accumulate');
  client.party?.me.setBackpack('BID_878_BistroSpooky_VPF4T');

  let warnTimeout: NodeJS.Timeout;
  let FirstLeaveTimeout: NodeJS.Timeout;
  let leaveTimeout: NodeJS.Timeout;

  function busy() {
    client.setStatus(config.data.busy_status);

    FirstLeaveTimeout = setTimeout(() => {
      client.party?.sendMessage(config.data.join_message);
    }, 2000)as unknown as NodeJS.Timeout & { refresh: () => NodeJS.Timeout };;

    warnTimeout = setTimeout(() => {
      client.party?.sendMessage(config.data.leave_message);
    }, config.data.time_before_leave * 60000)as unknown as NodeJS.Timeout & { refresh: () => NodeJS.Timeout };;

    leaveTimeout = setTimeout(async () => {
      if (queue.length > 1) {
        try {
          await client.joinParty(queue[0]);
          queue.shift();
          busy();
        } catch (error) {
          console.log(error);
          queue.shift();
          clearTimeout(warnTimeout);
          clearTimeout(leaveTimeout);
        }
      } else {
        client.leaveParty();
        client.setStatus(config.data.idle_status);
      }
    }, config.data.time_before_leave * 60000 + 1000) as unknown as NodeJS.Timeout & { refresh: () => NodeJS.Timeout };
  }

  client.on('friend:request', async (friend) => {
    console.log(`Received friend request from ${friend.displayName}`);

    try {
      await friend.accept();
      console.log(`Accepted friend request from ${friend.displayName}`);
    } catch (e) {
      console.error(`Error processing friend request from ${friend.displayName}: ${e}`);
    }
  });

  client.on('party:invite', async (party) => {
    try {
      console.log(`Received party invite from ${party.party.leader?.displayName}`);

      if (client.party?.leader?.id !== client.user?.id) {
        // Check if the party leader is already in the queue
        if (queue.includes(party.party.id)) {
          console.log(`${party.party.leader?.displayName} is already in the queue`);
          console.log(queue);
          await party.decline();
        } else {
          queue.push(party.party.id);
          await client.sendFriendMessage(party.party.leader?.id || '', "the bot is busy, you have been added to the queue");
          console.log(`Added ${party.party.leader?.displayName} to the queue`);
        }
      } else {
        await party.accept();
        busy();
        console.log(`Joined party with ${party.party.leader?.displayName}`);
      }
    } catch (error) {
      console.error(`Error handling party invite: ${error}`);
    }
  });

  client.on('party:member:kicked', async (party) => {
    console.log(`Kicked from party with ${party.party.leader?.displayName}`);
    try {
      if (party.id === client.user?.id && queue.length > 0) {
        clearTimeout(warnTimeout);
        clearTimeout(leaveTimeout);
        try {
          await client.joinParty(queue[0]);
          queue.shift();
          busy();
        } catch (error) {
          console.log(error);
          queue.shift();
          clearTimeout(warnTimeout);
          clearTimeout(leaveTimeout);
        }
      } else if (party.id === client.user?.id) {
        client.setStatus(config.data.idle_status);
        clearTimeout(warnTimeout);
        clearTimeout(leaveTimeout);
      }
    } catch (error) {
      console.error(`Error handling 'party:member:kicked' event: ${error}`);
    }
  });

  client.on('party:member:left', async (party) => {
    try {
      if (party.party.leader?.id === client.user?.id && queue.length > 0) {
        // Join the next person in the queue
        clearTimeout(warnTimeout);
        clearTimeout(leaveTimeout);
        try {
          await client.joinParty(queue[0]);
          queue.shift();
          busy();
        } catch (error) {
          console.log(error);
          queue.shift();
          clearTimeout(warnTimeout);
          clearTimeout(leaveTimeout);
        }
      } else if (party.party.leader?.id === client.user?.id && queue.length === 0) {
        // Last person in the party left, set status to idle and leave the party
        client.setStatus(config.data.idle_status);
        clearTimeout(warnTimeout);
        clearTimeout(leaveTimeout);
        await client.leaveParty();
      } else {
        // Remove the person who left from the queue
        const index = queue.indexOf(party.party.id);
        if (index !== -1) {
          queue.splice(index, 1);
        }
      }
    } catch (error) {
      console.error(`Error handling 'party:member:left' event: ${error}`);
    }
  });
})();
