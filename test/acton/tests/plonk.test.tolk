import "@acton/emulation/network"
import "@acton/testing/expect"
import "@acton/types/transaction"
import "@fixtures/fixtures"
import "helpers"

get fun `test canonical PLONK inputs reach pairing and reject an invalid proof`() {
    val target = deployVerifier("Plonk");
    val result = net.runGetMethodExt<bool>(target, "verify", plonkArgs());
    expect(result).toHaveExitCode(0);
    expect(result.unwrap()).toBeFalse();
    expect(sendProof(target, plonkBody())).toHaveFailedTx({ to: target, exitCode: 106 });
}

get fun `test PLONK rejects identity and non subgroup points at all nine positions`() {
    val target = deployVerifier("Plonk");
    val args = plonkInvalidPointArgs();
    val bodies = plonkInvalidPointBodies();
    var i = 0;
    while (i < args.size()) {
        expect(net.runGetMethodExt<bool>(target, "verify", args.get(i))).toHaveExitCode(106);
        expect(sendProof(target, bodies.get(i))).toHaveFailedTx({ to: target, exitCode: 106 });
        i += 1;
    }
}

get fun `test PLONK binds compressed points to transcript coordinates`() {
    val target = deployVerifier("Plonk");
    val args = plonkInvalidBindingArgs();
    val bodies = plonkInvalidBindingBodies();
    var i = 0;
    while (i < args.size()) {
        expect(net.runGetMethodExt<bool>(target, "verify", args.get(i))).toHaveExitCode(106);
        expect(sendProof(target, bodies.get(i))).toHaveFailedTx({ to: target, exitCode: 106 });
        i += 1;
    }
}

get fun `test PLONK rejects truncated and non canonical message trees`() {
    val target = deployVerifier("PlonkBoundary");
    val bodies = plonkMalformedMessages();
    var i = 0;
    while (i < bodies.size()) {
        expect(sendProof(target, bodies.get(i))).toHaveFailedTx({ to: target, exitCode: 105 });
        i += 1;
    }
}

get fun `test PLONK eight public inputs stay below the transaction gas budget`() {
    val target = deployVerifier("PlonkBoundary");
    val getter = net.runGetMethodExt<bool>(target, "verify", boundaryArgs());
    expect(getter).toHaveExitCode(0);
    expect(getter.unwrap()).toBeFalse();
    expect(getter.meta.gasUsed).toBeLess(920000);

    val result = sendProof(target, boundaryBody(), grams("0.07"));
    expect(result).toHaveFailedTx({ to: target, exitCode: 106 });
    expect(result.findTransaction({ to: target })!.getUsedGas()).toBeLess(920000);

    expect(
        sendProof(target, boundaryBody(), grams("0.069999999")),
    ).toHaveFailedTx({ to: target, exitCode: 107 });
}
