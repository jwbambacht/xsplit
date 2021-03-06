import dotenv from "dotenv";
import { fork, ChildProcess } from "child_process";
import fetch from "node-fetch";
import { plainToClass } from "class-transformer";
import { deriveKeypair, sign } from "ripple-keypairs";
import { Group } from "../../../src/models/Group";
import { AddBillRequest } from "../../../src/controllers/BillController";
import { AddGroupRequest } from "../../../src/controllers/GroupController";
import { TransactionRequest } from "../../../src/models/TransactionRequest";
import { RippleAPI } from "ripple-lib";
import rippleKey from "ripple-keypairs";

let child: ChildProcess;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

let bearer: string, createdGroup: Group, smallerGroup: Group, createdTr: TransactionRequest, derivationResult: {publicKey: string; privateKey: string};

beforeAll(async () => {
    dotenv.config();
    // Run the server as a child process
    child = fork("./dist/index.js");
    // Sleep to wait for child process to start up
    await sleep(4000);

    // Get authentication
    derivationResult = deriveKeypair(process.env.ALICE_SECRET);

    const resp = await fetch("http://localhost:" + process.env.PORT + "/api/login/challenge?username=alice");
    const challenge = await resp.json();

    const result = sign(challenge.challenge, derivationResult.privateKey);

    const bearerStr = Buffer.from("alice" + ":" + result).toString('base64');
    bearer = `bearer=${bearerStr};path=/;max-age=840;samesite=strict`;
});

// Tests depend on the groups created in this test
test('create 2 groups', async () => {
    const group = new AddGroupRequest();
    group.name = "test";
    group.description = "";
    group.participants = ["alice", "bob"];
    const res = await fetch('http://localhost:' + process.env.PORT + '/api/groups', {
        method: 'post',
         headers: {
            cookie: bearer,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(group)
    });
    expect(res.status).toBe(200);
    createdGroup = plainToClass(Group, await res.json());
    expect(createdGroup.bills.length).toBe(0);
    expect(createdGroup.name).toBe(group.name);
    expect(createdGroup.groupBalances.length).toBe(2);
    expect(createdGroup.participants.length).toBe(2);
    createdGroup.groupBalances.forEach(b => {
        expect(b.balance).toBe(0);
    });

    const group2 = new AddGroupRequest();
    group2.name = "test";
    group2.description = "";
    group2.participants = ["alice"];
    const res2 = await fetch('http://localhost:' + process.env.PORT + '/api/groups', {
        method: 'post',
         headers: {
            cookie: bearer,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(group2)
    });
    expect(res2.status).toBe(200);
    smallerGroup = plainToClass(Group, await res2.json());
    expect(smallerGroup.bills.length).toBe(0);
    expect(smallerGroup.name).toBe(group2.name);
    expect(smallerGroup.groupBalances.length).toBe(1);
    expect(smallerGroup.participants.length).toBe(1);
    smallerGroup.groupBalances.forEach(b => {
        expect(b.balance).toBe(0);
    });
});

test('add two bills and check balances', async () => {
    const bill = new AddBillRequest();
    bill.description = "test bill";
    bill.totalXrpDrops = 100;
    bill.participants = ["alice", "bob"];
    // eslint-disable-next-line
    bill.weights = [1, 1];
    const res = await fetch('http://localhost:' + process.env.PORT + '/api/groups/' + createdGroup.id + '/bill', {
        method: 'put',
         headers: {
            cookie: bearer,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(bill)
    });
    expect(res.status).toBe(200);
    const updatedGroup = plainToClass(Group, await res.json());
    expect(updatedGroup.bills.length).toBe(1);
    expect(updatedGroup.name).toBe(createdGroup.name);
    expect(updatedGroup.groupBalances.length).toBe(2);
    expect(updatedGroup.participants.length).toBe(2);
    updatedGroup.groupBalances.forEach(b => {
        if (b.user.username === "alice") {
            expect(b.balance).toBe(50);
        } else {
            expect(b.balance).toBe(-50);
        }
    });
    const res2 = await fetch('http://localhost:' + process.env.PORT + '/api/groups/' + createdGroup.id + '/bill', {
        method: 'put',
         headers: {
            cookie: bearer,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(bill)
    });
    expect(res2.status).toBe(200);
    const updatedGroup2 = plainToClass(Group, await res2.json());
    expect(updatedGroup2.bills.length).toBe(2);
    expect(updatedGroup2.name).toBe(createdGroup.name);
    expect(updatedGroup2.groupBalances.length).toBe(2);
    expect(updatedGroup2.participants.length).toBe(2);
    updatedGroup2.groupBalances.forEach(b => {
        if (b.user.username === "alice") {
            expect(b.balance).toBe(100);
        } else {
            expect(b.balance).toBe(-100);
        }
    });
});

test('settle bill', async () => {
    const res = await fetch('http://localhost:' + process.env.PORT + '/api/groups/' + createdGroup.id + '/settle', {
        method: 'put',
         headers: {
            cookie: bearer
        }
    });
    expect(res.status).toBe(200);
    const updatedGroup = plainToClass(Group, await res.json());
    expect(updatedGroup.transactionRequests.length).toBe(1);
    createdTr = updatedGroup.transactionRequests[0];
    expect(createdTr.creditor.username).toBe("alice");
    expect(createdTr.debtor.username).toBe("bob");
    expect(createdTr.totalXrpDrops).toBe(100);
});

// This test depends on the XRP account of bob having enough balance and on the ledger
test('pay settlement request', async () => {
    jest.setTimeout(20000);
    const bobDerivation = deriveKeypair(process.env.BOB_SECRET);

    const resp = await fetch("http://localhost:" + process.env.PORT + "/api/login/challenge?username=bob");
    const challenge = await resp.json();

    const result = sign(challenge.challenge, bobDerivation.privateKey);

    const bearerStr = Buffer.from("bob" + ":" + result).toString('base64');
    const bobBearer = `bearer=${bearerStr};path=/;max-age=840;samesite=strict`;

    const transaction = {
        Account: rippleKey.deriveAddress(bobDerivation.publicKey),
        TransactionType: "Payment",
        Amount: createdTr.totalXrpDrops + "",
        Destination: rippleKey.deriveAddress(createdTr.creditor.publickey)
    };
    let signedTransaction;
    try {
        const api = new RippleAPI({server: process.env.RIPPLE_SERVER});
        await api.connect();
        const preparedTransaction = await api.prepareTransaction(transaction);
        signedTransaction = api.sign(preparedTransaction.txJSON, process.env.BOB_SECRET);
        await api.submit(signedTransaction.signedTransaction);
        api.disconnect();
    } catch (e) {
        console.log(e);
    }

    const response = await fetch("http://localhost:" + process.env.PORT + "/api/transactions/pay", {
		method: "PUT",
		headers: {
            "Content-Type": "application/json",
            cookie: bobBearer
        },
		body: JSON.stringify({
            id: createdTr.id,
            transactionHash: signedTransaction.id
		})
    });
    expect(response.status).toBe(200);

    const res = await fetch('http://localhost:' + process.env.PORT + '/api/groups/' + createdGroup.id, {
        method: 'get',
         headers: {
            cookie: bearer
        }
    });
    expect(res.status).toBe(200);
    const updatedGroup = plainToClass(Group, await res.json());
    expect(updatedGroup.bills.length).toBe(2);
    expect(updatedGroup.name).toBe(createdGroup.name);
    expect(updatedGroup.groupBalances.length).toBe(2);
    expect(updatedGroup.participants.length).toBe(2);
    updatedGroup.groupBalances.forEach(b => {
        expect(b.balance).toBe(0);
    });
}, 10000);

test('update group description and get the group', async () => {
    const group = new Group();
    group.name = createdGroup.name;
    group.description = "we have description nao";
    const update = await fetch('http://localhost:' + process.env.PORT + '/api/groups/' + createdGroup.id, {
        method: 'put',
         headers: {
            cookie: bearer,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(group)
    });
    expect(update.status).toBe(200);
    const res = await fetch('http://localhost:' + process.env.PORT + '/api/groups/' + createdGroup.id, {
        method: 'get',
         headers: {
            cookie: bearer
        }
    });
    expect(res.status).toBe(200);
    const updatedGroup = plainToClass(Group, await res.json());
    expect(updatedGroup.bills.length).toBe(2);
    expect(updatedGroup.name).toBe(createdGroup.name);
    expect(updatedGroup.description).toBe(group.description);
    expect(updatedGroup.groupBalances.length).toBe(2);
    expect(updatedGroup.participants.length).toBe(2);
});

test('add participant to group', async () => {
    const fail = await fetch('http://localhost:' + process.env.PORT + '/api/groups/' + createdGroup.id + "/user/alice", {
        method: 'put',
         headers: {
            cookie: bearer
        }
    });
    expect(fail.status).toBe(400);

    const update = await fetch('http://localhost:' + process.env.PORT + '/api/groups/' + smallerGroup.id + "/user/bob", {
        method: 'put',
         headers: {
            cookie: bearer
        }
    });
    expect(update.status).toBe(200);
    const res = await fetch('http://localhost:' + process.env.PORT + '/api/groups/' + smallerGroup.id, {
        method: 'get',
         headers: {
            cookie: bearer
        }
    });
    expect(res.status).toBe(200);
    const group = plainToClass(Group, await res.json());
    expect(group.bills.length).toBe(0);
    expect(group.name).toBe(smallerGroup.name);
    expect(group.groupBalances.length).toBe(2);
    expect(group.participants.length).toBe(2);
    group.groupBalances.forEach(b => {
        expect(b.balance).toBe(0);
    });
});

afterAll(async () => {
    child.kill();
});