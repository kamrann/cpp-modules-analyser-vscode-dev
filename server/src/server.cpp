
extern "C" {
    int run_server(int argc, char const* const argv[]);
}

int main(int const argc, char const* const argv[])
{
    return run_server(argc, argv);
}
