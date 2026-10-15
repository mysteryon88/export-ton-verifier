import "@acton/emulation/network"
import "@acton/testing/expect"
import "@fixtures/fixtures"
import "helpers"

get fun `test PLONK coordinate comparisons match integer boundaries at every limb`() {
    val target = deployVerifier("PlonkHelpers", "test/acton/generated/PlonkHelpers.tolk");
    val cases = plonkComparisonCases();
    var i = 0;
    while (i < cases.size()) {
        val sample = cases.get(i);
        val args: array<unknown> = [sample.encoded.beginParse()];
        val base = net.runGetMethodExt<bool>(target, "compareBaseField", args);
        val half = net.runGetMethodExt<bool>(target, "compareHalfBaseField", args);
        expect(base).toHaveExitCode(0);
        expect(half).toHaveExitCode(0);
        expect(base.unwrap()).toEqual(sample.belowBase);
        expect(half.unwrap()).toEqual(sample.belowHalf);
        i += 1;
    }
}

get fun `test PLONK coordinate comparisons reject truncated and trailing data`() {
    val target = deployVerifier("PlonkHelpers", "test/acton/generated/PlonkHelpers.tolk");
    val cells = plonkMalformedCoordinates();
    var i = 0;
    while (i < cells.size()) {
        val args: array<unknown> = [cells.get(i).beginParse()];
        expect(net.runGetMethodExt<bool>(target, "compareBaseField", args)).toHaveExitCode(9);
        expect(net.runGetMethodExt<bool>(target, "compareHalfBaseField", args)).toHaveExitCode(9);
        i += 1;
    }
}
