using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace WindowsTtsHelper.Tests;

internal sealed class TestApplicationFactory(Action<IServiceCollection>? configureServices = null)
    : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        if (configureServices is null)
        {
            return;
        }

        builder.ConfigureServices(services => configureServices(services));
    }
}
