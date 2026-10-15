import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@fixtures/fixtures"
import "helpers"

get fun `test empty top up deploys generated Groth16 verifier`() {
    val target = deployVerifier("Groth16");
    expect(testing.isDeployed(target)).toBeTrue();
}

get fun `test Groth16 accepts a valid proof in getters and messages`() {
    val target = deployVerifier("Groth16");
    val result = net.runGetMethodExt<bool>(target, "verify", groth16Args());
    expect(result).toHaveExitCode(0);
    expect(result.unwrap()).toBeTrue();
    expect(sendProof(target, groth16Body())).toHaveSuccessfulTx({ to: target });
    expect(sendProof(target, groth16WrongBody())).toHaveFailedTx({ to: target, exitCode: 260 });
    expect(
        sendProof(target, groth16Body(), grams("0.049999999")),
    ).toHaveFailedTx({ to: target, exitCode: 261 });
}

get fun `test Groth16 compiles and executes flat and named batching boundaries`() {
    val cases = groth16CompileCases();
    var i = 0;
    while (i < cases.size()) {
        val case = cases.get(i);
        val target = deployVerifier("Groth16Boundary", case.source);
        var args = groth16Args();
        args.set(case.inputs, 3);
        val result = net.runGetMethodExt<bool>(target, case.getter, args);
        expect(result).toHaveExitCode(0);
        expect(result.unwrap()).toBeTrue();
        i += 1;
    }
}

get fun `test Groth16 rejects malformed identity and non subgroup proof points`() {
    val target = deployVerifier("Groth16");
    val cases = groth16InvalidPointArgs();
    var i = 0;
    while (i < cases.size()) {
        expect(net.runGetMethodExt<bool>(target, "verify", cases.get(i))).toHaveExitCode(258);
        i += 1;
    }
}

get fun `test Groth16 enforces public input count and canonical scalar range`() {
    val target = deployVerifier("Groth16");
    val cases = groth16InvalidScalarArgs();
    var i = 0;
    while (i < cases.size()) {
        expect(net.runGetMethodExt<bool>(target, "verify", cases.get(i))).toHaveExitCode(258);
        i += 1;
    }
    expect(net.runGetMethodExt<bool>(target, "verify", groth16MaxScalarArgs())).toHaveExitCode(0);
}

get fun `test Groth16 rejects exotic cells trailing data and alternate public input chains`() {
    val target = deployVerifier("Groth16");
    val cases = groth16InvalidMessages();
    var i = 0;
    while (i < cases.size()) {
        expect(sendProof(target, cases.get(i))).toHaveFailedTx({ to: target, exitCode: 258 });
        i += 1;
    }
}
