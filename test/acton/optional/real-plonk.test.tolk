import "@acton/emulation/network"
import "@acton/testing/expect"
import "@fixtures/real-fixtures"
import "@tests/helpers"

get fun `test real snarkjs PLONK proof passes getters and internal messages`() {
    val target = deployVerifier("PlonkReal", "test/acton/generated/PlonkReal.tolk");
    val valid = net.runGetMethodExt<bool>(target, "verify", realPlonkArgs());
    expect(valid).toHaveExitCode(0);
    expect(valid.unwrap()).toBeTrue();
    expect(valid.meta.gasUsed).toBeLess(900000);
    expect(sendProof(target, realPlonkBody(), grams("1"))).toHaveSuccessfulTx({ to: target });

    val invalid = net.runGetMethodExt<bool>(target, "verify", realPlonkInvalidArgs());
    expect(invalid).toHaveExitCode(0);
    expect(invalid.unwrap()).toBeFalse();
    expect(
        sendProof(target, realPlonkInvalidBody(), grams("1")),
    ).toHaveFailedTx({ to: target, exitCode: 106 });
}
