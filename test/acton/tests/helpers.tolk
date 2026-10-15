import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

fun deployVerifier(name: string, path: string = ""): address {
    val dest: AutoDeployAddress = {
        stateInit: { code: build(name, path), data: beginCell().endCell() },
    };
    val target = dest.calculateAddress();
    val sender = testing.treasury("sender");
    val result = net.send(
        sender.address,
        createMessage({
            dest,
            value: grams("1"),
            bounce: BounceMode.NoBounce,
        }),
    );
    expect(result).toHaveSuccessfulDeploy({ to: target });
    return target;
}

fun sendProof(target: address, body: cell, value: coins = grams("0.1")): SendResultList {
    val sender = testing.treasury("sender");
    return net.send(
        sender.address,
        createMessage({
            dest: target,
            value,
            bounce: BounceMode.NoBounce,
            body,
        }),
    );
}
