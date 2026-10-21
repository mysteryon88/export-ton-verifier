pragma circom 2.1.0;

template Condition() {
    signal input a;
    signal input b;
    signal input cond;
    signal output result;

    cond * (cond - 1) === 0;
    result <== cond * (a - b) + b;
}

component main = Condition();
